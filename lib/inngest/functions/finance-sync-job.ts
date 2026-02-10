import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { executeSyncRule } from "@/app/actions/finance-sync";

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
    // Only one sync per rule per company at a time
    concurrency: {
      limit: 1,
      key: "event.data.companyId + '-' + event.data.syncRuleId",
    },
    // Handle failures — mark job as FAILED
    onFailure: async ({ event, error }) => {
      const { jobId } = event.data.event.data;
      console.error(`Finance sync job ${jobId} failed:`, error);

      try {
        await prisma.financeSyncJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            summary: {
              error: error.message || "הסנכרון נכשל",
              failedAt: new Date().toISOString(),
            },
          },
        });
      } catch (updateError) {
        console.error("Failed to update sync job status:", updateError);
      }
    },
  },
  { event: "finance-sync/job.started" },
  async ({ event, step, logger }) => {
    const { jobId, syncRuleId, companyId } = event.data;

    logger.info("Starting finance sync job", { jobId, syncRuleId });

    // Step 1: Load and validate job/rule, mark RUNNING
    const { rule } = await step.run("load-rule", async () => {
      const job = await prisma.financeSyncJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new Error(`Finance sync job ${jobId} not found`);
      }

      if (job.status === "COMPLETED") {
        throw new Error("Job already completed");
      }

      const rule = await prisma.financeSyncRule.findUnique({
        where: { id: syncRuleId },
      });

      if (!rule) {
        throw new Error(`Sync rule ${syncRuleId} not found`);
      }

      // Mark as RUNNING
      await prisma.financeSyncJob.update({
        where: { id: jobId },
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
        where: { id: syncRuleId },
        data: { lastRunAt: new Date() },
      });

      await prisma.financeSyncJob.update({
        where: { id: jobId },
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
