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
          // P1: Resolve FIXED_EXPENSES sync rule so @@unique([syncRuleId, originId]) prevents duplicates
          const fixedExpenseRule = await prisma.financeSyncRule.findFirst({
            where: { companyId, sourceType: "FIXED_EXPENSES", isActive: true },
            select: { id: true },
          });

          const expenses = await prisma.fixedExpense.findMany({
            where: { companyId, status: "ACTIVE" },
            take: 500,
          });

          // Pre-fetch existing originIds for this company
          const existingRecords = await prisma.financeRecord.findMany({
            where: {
              companyId,
              deletedAt: null,
              originId: { startsWith: "fixed_" },
            },
            select: { originId: true },
            take: 10000,
          });
          const existingOriginIds = new Set(
            existingRecords.map((r) => r.originId),
          );

          const today = new Date();
          const recordsToCreate: any[] = [];

          for (const expense of expenses) {
            const startDate = expense.startDate || expense.createdAt;
            const frequency = expense.frequency;
            const payDay = expense.payDay || startDate.getDate();
            const baseOriginId = `fixed_${expense.id}`;

            let year = startDate.getFullYear();
            let month = startDate.getMonth();

            const getValidDate = (y: number, m: number, d: number) => {
              const date = new Date(y, m, d);
              if (date.getMonth() !== ((m % 12) + 12) % 12) {
                return new Date(y, m + 1, 0);
              }
              return date;
            };

            let checkDate = getValidDate(year, month, payDay);
            if (checkDate < startDate) {
              if (frequency === "MONTHLY") month++;
              else if (frequency === "QUARTERLY") month += 3;
              else if (frequency === "YEARLY") year++;
              checkDate = getValidDate(year, month, payDay);
            }

            let iterations = 0;
            while (checkDate <= today && iterations < 200) {
              const yStr = checkDate.getFullYear();
              const mStr = checkDate.getMonth() + 1;
              const dStr = checkDate.getDate();
              const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

              if (!existingOriginIds.has(originId)) {
                recordsToCreate.push({
                  companyId,
                  title: expense.title,
                  amount: expense.amount,
                  type: "EXPENSE",
                  category: expense.category || "Fixed Expense",
                  date: checkDate,
                  status: "COMPLETED",
                  description:
                    expense.description || `Fixed Expense: ${frequency}`,
                  originId,
                  syncRuleId: fixedExpenseRule?.id ?? null,
                });
              }

              if (frequency === "MONTHLY") month++;
              else if (frequency === "QUARTERLY") month += 3;
              else if (frequency === "YEARLY") year++;
              else break; // ONE_TIME

              checkDate = getValidDate(year, month, payDay);
              iterations++;
            }
          }

          if (recordsToCreate.length > 0) {
            await prisma.financeRecord.createMany({ data: recordsToCreate, skipDuplicates: true });
          }

          return recordsToCreate.length;
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
