import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { executeSyncRule } from "@/lib/finance-sync-internal";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceSyncJob");

/**
 * Background job for processing finance sync rules.
 *
 * Runs outside of the HTTP request lifecycle so the UI stays responsive.
 * Follows the same pattern as processImportJob.
 */
export const processFinanceSyncJob = inngest.createFunction(
  {
    id: "process-finance-sync-job",
    name: "Process Finance Sync Job",
    retries: 3,
    timeouts: { finish: "180s" },
    // Only one sync per rule per company at a time
    concurrency: {
      limit: 1,
      key: "event.data.companyId + '-' + event.data.syncRuleId",
    },
    // Handle failures — mark job as FAILED
    onFailure: async ({ event, error }) => {
      const { jobId } = event.data.event.data;
      log.error("Finance sync job failed", { jobId, error: String(error) });

      try {
        // Only mark as FAILED if the job hasn't already been marked COMPLETED
        const job = await prisma.financeSyncJob.findFirst({
          where: { id: jobId, companyId: event.data.event.data.companyId },
          select: { status: true },
        });

        if (job && job.status !== "COMPLETED") {
          await prisma.financeSyncJob.update({
            where: { id: jobId, companyId: event.data.event.data.companyId },
            data: {
              status: "FAILED",
              summary: {
                error: error.message || "הסנכרון נכשל",
                failedAt: new Date().toISOString(),
              },
            },
          });
        }
      } catch (updateError) {
        log.error("Failed to update sync job status", { error: String(updateError) });
      }
    },
  },
  { event: "finance-sync/job.started" },
  async ({ event, step, logger }) => {
    const { jobId, syncRuleId, companyId } = event.data;

    logger.info("Starting finance sync job", { jobId, syncRuleId });

    // Step 1: Load and validate job/rule, mark RUNNING
    const { rule } = await step.run("load-rule", async () => {
      // SECURITY: Filter by companyId to prevent cross-tenant access
      const job = await prisma.financeSyncJob.findFirst({
        where: { id: jobId, companyId },
      });

      if (!job) {
        throw new Error(`Finance sync job ${jobId} not found`);
      }

      if (job.status === "COMPLETED") {
        throw new Error("Job already completed");
      }

      // SECURITY: Filter by companyId to prevent cross-tenant access
      const rule = await prisma.financeSyncRule.findFirst({
        where: { id: syncRuleId, companyId },
      });

      if (!rule) {
        throw new Error(`Sync rule ${syncRuleId} not found`);
      }

      // Mark as RUNNING
      await prisma.financeSyncJob.update({
        where: { id: jobId, companyId },
        data: { status: "RUNNING" },
      });

      return { rule };
    });

    // Step 2: Execute the sync logic
    const stats = await step.run("sync-records", async () => {
      return await executeSyncRule(syncRuleId, companyId);
    });

    // Step 3: Finalize — update lastRunAt, mark COMPLETED
    await step.run("finalize", async () => {
      await prisma.financeSyncRule.update({
        where: { id: syncRuleId, companyId },
        data: { lastRunAt: new Date() },
      });

      await prisma.financeSyncJob.update({
        where: { id: jobId, companyId },
        data: {
          status: "COMPLETED",
          summary: {
            ...stats,
            completedAt: new Date().toISOString(),
          },
        },
      });

      logger.info("Finance sync job completed", { jobId, stats });
    });

    return { success: true, jobId, stats };
  },
);
