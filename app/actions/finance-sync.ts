"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export interface SyncMapping {
  amountField: string;
  dateField: string;
  titleField: string;
  categoryValue?: string; // Static category (e.g. "Marketing")
  categoryField?: string; // Dynamic category from column
}

export async function createSyncRule(data: {
  name: string;
  targetType: "INCOME" | "EXPENSE";
  sourceType: "TABLE" | "TRANSACTIONS" | "RETAINERS";
  sourceId?: number; // Optional for system sources
  fieldMapping: SyncMapping;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const rule = await prisma.financeSyncRule.create({
    data: {
      companyId: user.companyId,
      name: data.name,
      targetType: data.targetType,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      fieldMapping: data.fieldMapping as any,
    },
  });

  return rule;
}

export async function updateSyncRule(
  id: number,
  data: { name?: string; targetType?: "INCOME" | "EXPENSE" }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.financeSyncRule.update({
    where: { id, companyId: user.companyId },
    data: {
      name: data.name,
      targetType: data.targetType,
    },
  });

  revalidatePath("/finance/collect");
  revalidatePath("/finance/income-expenses");
}

export async function runSyncRule(ruleId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const rule = await prisma.financeSyncRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule || rule.companyId !== user.companyId)
    throw new Error("Rule not found");

  let stats = {
    scanned: 0,
    created: 0,
    skippedExists: 0,
    skippedError: 0,
    errors: [] as string[],
  };

  try {
    if (rule.sourceType === "TABLE" && rule.sourceId) {
      // --- TABLE SOURCE ---
      const records = await prisma.record.findMany({
        where: { tableId: rule.sourceId, companyId: user.companyId },
        select: { id: true, data: true, createdAt: true },
      });

      stats.scanned = records.length;
      const mapping = rule.fieldMapping as any as SyncMapping;

      for (const record of records) {
        const res = await processTableRecord(
          rule,
          record.id.toString(),
          record.data,
          mapping,
          user.companyId,
          record.createdAt
        );
        if (res.status === "created") stats.created++;
        else if (res.status === "exists") stats.skippedExists++;
        else {
          stats.skippedError++;
          if (stats.errors.length < 5)
            stats.errors.push(`Record #${record.id}: ${res.error}`);
        }
      }
    } else if (rule.sourceType === "TRANSACTIONS") {
      // --- SYSTEM TRANSACTIONS SOURCE ---
      // 1. Fetch from Transactions table (Legacy or specific transactions)
      const transactions = await prisma.transaction.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["manual-marked-paid", "paid", "Pd", "PAID"] }, // Support various paid statuses
        },
      });

      // 2. Fetch from OneTimePayments (The main payment system)
      const payments = await prisma.oneTimePayment.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["paid", "PAID"] }, // Ensure we catch 'paid' status
        },
      });

      stats.scanned = transactions.length + payments.length;

      // Process Transactions
      for (const t of transactions) {
        const date = t.paidDate || t.attemptDate || t.createdAt;
        const title = t.notes || `System Transaction #${t.id}`;
        const amount = Number(t.amount);

        if (amount > 0) {
          const res = await createFinanceRecord(
            rule,
            `trans_${t.id}`,
            {
              title,
              amount,
              date,
              category: "System Transaction",
            },
            user.companyId
          );

          if (res === "created") stats.created++;
          else stats.skippedExists++;
        } else {
          stats.skippedError++;
        }
      }

      // Process Payments
      for (const p of payments) {
        const date = p.paidDate || p.dueDate || p.createdAt;
        const title = p.title || `Payment #${p.id}`;
        const amount = Number(p.amount);

        if (amount > 0) {
          const res = await createFinanceRecord(
            rule,
            `payment_${p.id}`,
            {
              title,
              amount,
              date,
              category: "Payment System",
            },
            user.companyId
          );

          if (res === "created") stats.created++;
          else stats.skippedExists++;
        } else {
          stats.skippedError++;
        }
      }
    }

    // Update last run time
    await prisma.financeSyncRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    });

    revalidatePath("/finance/income-expenses");
    revalidatePath("/finance/collect");

    console.log(`Sync Rule #${ruleId} Finished:`, stats);
    return { success: true, count: stats.created, stats };
  } catch (error) {
    console.error("Sync Error:", error);
    throw new Error("Failed to process sync rule");
  }
}

// --- HELPERS ---

async function createFinanceRecord(
  rule: any,
  originId: string,
  data: { title: string; amount: number; date: Date; category: string },
  companyId: number
): Promise<"created" | "exists"> {
  const exists = await prisma.financeRecord.findUnique({
    where: {
      syncRuleId_originId: {
        syncRuleId: rule.id,
        originId: originId,
      },
    },
  });

  if (!exists) {
    await prisma.financeRecord.create({
      data: {
        companyId: companyId,
        title: data.title,
        amount: data.amount,
        type: rule.targetType,
        category: data.category,
        date: data.date,
        status: "COMPLETED",
        syncRuleId: rule.id,
        originId: originId,
      },
    });
    return "created";
  }
  return "exists";
}

async function processTableRecord(
  rule: any,
  originId: string,
  data: any,
  mapping: SyncMapping,
  companyId: number,
  defaultDate: Date
): Promise<{ status: "created" | "exists" | "error"; error?: string }> {
  const rawAmount = data[mapping.amountField];

  // If amount field is missing in data, it's a mapping error
  if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
    return {
      status: "error",
      error: `Missing amount in field '${mapping.amountField}'`,
    };
  }

  let rawDate = mapping.dateField ? data[mapping.dateField] : defaultDate;
  if (!rawDate) rawDate = defaultDate; // Fallback if specific field is empty

  const title = data[mapping.titleField] || `Imported #${originId}`;

  const category = mapping.categoryField
    ? data[mapping.categoryField]
    : mapping.categoryValue || "General";

  // Robust Parsing
  let amount = 0;
  if (typeof rawAmount === "number") amount = rawAmount;
  else if (typeof rawAmount === "string") {
    const cleaned = rawAmount.replace(/[^0-9.-]+/g, "");
    amount = parseFloat(cleaned);
  }

  if (isNaN(amount) || amount === 0) {
    return { status: "error", error: `Invalid amount value: ${rawAmount}` };
  }

  let date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (isNaN(date.getTime())) {
    // Try fallback to default date if specific parse failed
    date = defaultDate;
    // If still invalid (shouldn't happen for createdAt), then error
    if (isNaN(date.getTime())) {
      return { status: "error", error: `Invalid date value: ${rawDate}` };
    }
  }

  const status = await createFinanceRecord(
    rule,
    originId,
    { title, amount, date, category },
    companyId
  );
  return { status };
}

export async function deleteSyncRule(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Delete all finance records created by this rule
  await prisma.financeRecord.deleteMany({
    where: { syncRuleId: id },
  });

  await prisma.financeSyncRule.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/finance/collect");
  revalidatePath("/finance/income-expenses");
}

export async function getSyncRules() {
  const user = await getCurrentUser();
  if (!user) return [];
  return prisma.financeSyncRule.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
  });
}
