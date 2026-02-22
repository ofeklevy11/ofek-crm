import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";

/**
 * Scheduled cron job to process fixed expenses (Issue 27).
 * Runs hourly instead of blocking every finance page load.
 * Iterates per-company to avoid loading everything at once.
 */
export const processFixedExpensesCron = inngest.createFunction(
  {
    id: "process-fixed-expenses-cron",
    name: "Process Fixed Expenses",
    retries: 1,
    timeouts: { finish: "120s" },
    concurrency: { limit: 1 },
  },
  { cron: "0 * * * *" }, // Every hour
  async ({ step, logger }) => {
    // Step 1: Find companies that have active fixed expenses
    const companyIds = await step.run("find-companies", async () => {
      const companies = await prisma.fixedExpense.findMany({
        where: { status: "ACTIVE" },
        select: { companyId: true },
        distinct: ["companyId"],
        take: 500,
      });
      return companies.map((c) => c.companyId);
    });

    if (companyIds.length === 0) {
      return { processed: 0 };
    }

    let totalCreated = 0;

    // Step 2: Process each company separately
    for (const companyId of companyIds) {
      const created = await step.run(
        `process-company-${companyId}`,
        async () => {
          const { processFixedExpensesInternal } = await import("@/lib/finance-sync-internal");
          return await processFixedExpensesInternal(companyId, prisma);
        },
      );

      totalCreated += created;
    }

    if (totalCreated > 0) {
      logger.info(`[fixed-expenses-cron] Created ${totalCreated} records across ${companyIds.length} companies`);
    }

    return { companies: companyIds.length, created: totalCreated };
  },
);
