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
  sourceType:
    | "TABLE"
    | "TRANSACTIONS"
    | "RETAINERS"
    | "FIXED_EXPENSES"
    | "PAYMENTS_RETAINERS";
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
  data: { name?: string; targetType?: "INCOME" | "EXPENSE" },
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
    updated: 0,
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
          record.createdAt,
        );
        if (res.status === "created") stats.created++;
        else if (res.status === "updated") stats.updated++;
        else if (res.status === "exists") stats.skippedExists++;
        else {
          stats.skippedError++;
          if (stats.errors.length < 5)
            stats.errors.push(`Record #${record.id}: ${res.error}`);
        }
      }
    } else if (
      rule.sourceType === "TRANSACTIONS" ||
      rule.sourceType === "PAYMENTS_RETAINERS"
    ) {
      // --- SYSTEM PAYMENTS SOURCE ---
      // 1. Fetch from Transactions table (Legacy or specific transactions)
      const transactions = await prisma.transaction.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["manual-marked-paid", "paid", "Pd", "PAID"] }, // Support various paid statuses
        },
        include: { client: true },
      });

      // 2. Fetch from OneTimePayments (The main payment system)
      const payments = await prisma.oneTimePayment.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["paid", "PAID"] }, // Ensure we catch 'paid' status
        },
        include: { client: true },
      });

      stats.scanned = transactions.length + payments.length;

      // Process Transactions
      for (const t of transactions) {
        const date = t.paidDate || t.attemptDate || t.createdAt;
        const title = t.notes || `System Transaction #${t.id}`;
        // Ensure 2 decimal precision to avoid floating point artifacts
        const amount =
          Math.round((Number(t.amount) + Number.EPSILON) * 100) / 100;

        if (amount > 0) {
          const res = await createFinanceRecord(
            rule,
            `trans_${t.id}`,
            {
              title,
              amount,
              date,
              category: "System Transaction",
              clientId: t.clientId,
            },
            user.companyId,
          );

          if (res === "created") stats.created++;
          else if (res === "updated") stats.updated++;
          else stats.skippedExists++;
        } else {
          stats.skippedError++;
        }
      }

      // Process Payments
      for (const p of payments) {
        const date = p.paidDate || p.dueDate || p.createdAt;
        const title = p.title || `Payment #${p.id}`;
        // Ensure 2 decimal precision to avoid floating point artifacts
        const amount =
          Math.round((Number(p.amount) + Number.EPSILON) * 100) / 100;

        if (amount > 0) {
          const res = await createFinanceRecord(
            rule,
            `payment_${p.id}`,
            {
              title,
              amount,
              date,
              category: "Payment System",
              clientId: p.clientId,
            },
            user.companyId,
            "INCOME", // Force Income for Client Payments
          );

          if (res === "created") stats.created++;
          else if (res === "updated") stats.updated++;
          else stats.skippedExists++;
        } else {
          stats.skippedError++;
        }
      }
    } else if (rule.sourceType === "FIXED_EXPENSES") {
      // --- FIXED EXPENSES SOURCE ---
      // 1. Ensure all fixed expenses have generated their records
      const { processFixedExpenses } = await import("./fixed-expenses");
      const generatedCount = (await processFixedExpenses()) || 0;

      // 2. Link unlinked fixed expense records to this rule
      // Find records that start with "fixed_" and have no syncRuleId (or different one, but usually none)
      const unlinkedRecords = await prisma.financeRecord.findMany({
        where: {
          companyId: user.companyId,
          originId: { startsWith: "fixed_" },
          syncRuleId: null,
        },
      });

      stats.scanned = unlinkedRecords.length;

      if (unlinkedRecords.length > 0) {
        await prisma.financeRecord.updateMany({
          where: {
            id: { in: unlinkedRecords.map((r) => r.id) },
          },
          data: {
            syncRuleId: rule.id,
          },
        });
        stats.created = generatedCount; // Use generated count as "new" action indicator
        stats.updated = unlinkedRecords.length; // These were linked
      } else {
        stats.created = generatedCount;
      }
    }

    // --- GARBAGE COLLECTION ---
    // Remove FinanceRecords linked to this rule whose source no longer exists.
    const currentOriginIds: string[] = [];

    if (rule.sourceType === "TABLE" && rule.sourceId) {
      const records = await prisma.record.findMany({
        where: { tableId: rule.sourceId, companyId: user.companyId },
        select: { id: true },
      });
      records.forEach((r) => currentOriginIds.push(r.id.toString()));
    } else if (
      rule.sourceType === "TRANSACTIONS" ||
      rule.sourceType === "PAYMENTS_RETAINERS"
    ) {
      const transactions = await prisma.transaction.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["manual-marked-paid", "paid", "Pd", "PAID"] },
        },
        select: { id: true },
      });
      transactions.forEach((t) => currentOriginIds.push(`trans_${t.id}`));

      const payments = await prisma.oneTimePayment.findMany({
        where: {
          client: { companyId: user.companyId },
          status: { in: ["paid", "PAID"] },
        },
        select: { id: true },
      });
      payments.forEach((p) => currentOriginIds.push(`payment_${p.id}`));
    }

    if (
      currentOriginIds.length > 0 &&
      rule.sourceType !== "FIXED_EXPENSES" // Skip for fixed expenses
    ) {
      await prisma.financeRecord.deleteMany({
        where: {
          syncRuleId: rule.id,
          originId: { notIn: currentOriginIds },
        },
      });
    } else if (
      currentOriginIds.length === 0 &&
      (rule.sourceType === "TRANSACTIONS" ||
        rule.sourceType === "PAYMENTS_RETAINERS" ||
        rule.sourceType === "TABLE")
    ) {
      // If no source items found, delete ALL records for this rule (source was emptied)
      await prisma.financeRecord.deleteMany({
        where: { syncRuleId: rule.id },
      });
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
  data: {
    title: string;
    amount: number;
    date: Date;
    category: string;
    clientId?: number;
  },
  companyId: number,
  forcedType?: "INCOME" | "EXPENSE",
): Promise<"created" | "exists" | "updated"> {
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
        type: forcedType || rule.targetType,
        category: data.category,
        date: data.date,
        status: "COMPLETED",
        syncRuleId: rule.id,
        originId: originId,
        clientId: data.clientId,
      },
    });
    return "created";
  } else {
    // Check if update is needed
    // Normalize dates for comparison (ignoring slight time diffs if they are just date imports, but here we compare strict)
    // We strictly compare amount, title, type.
    const isDifferent =
      Number(exists.amount) !== data.amount ||
      exists.title !== data.title ||
      exists.type !== (forcedType || rule.targetType) ||
      exists.category !== data.category ||
      exists.date.getTime() !== data.date.getTime() ||
      (data.clientId && exists.clientId !== data.clientId);

    if (isDifferent) {
      await prisma.financeRecord.update({
        where: { id: exists.id },
        data: {
          title: data.title,
          amount: data.amount,
          type: forcedType || rule.targetType,
          category: data.category,
          date: data.date,
          clientId: data.clientId, // Update client ID if changed/missing
        },
      });
      return "updated";
    }
  }

  return "exists";
}

async function processTableRecord(
  rule: any,
  originId: string,
  data: any,
  mapping: SyncMapping,
  companyId: number,
  defaultDate: Date,
): Promise<{
  status: "created" | "exists" | "updated" | "error";
  error?: string;
}> {
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

  // Ensure 2 decimal precision
  amount = Math.round((amount + Number.EPSILON) * 100) / 100;

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
    companyId,
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

  await ensureDefaultRules(user.companyId);

  return prisma.financeSyncRule.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
  });
}

async function ensureDefaultRules(companyId: number) {
  // 1. Fixed Expenses Rule
  const fixedRule = await prisma.financeSyncRule.findFirst({
    where: { companyId, sourceType: "FIXED_EXPENSES" },
  });

  if (!fixedRule) {
    await prisma.financeSyncRule.create({
      data: {
        companyId,
        name: "הוצאות קבועות",
        sourceType: "FIXED_EXPENSES",
        targetType: "EXPENSE",
        fieldMapping: {},
      },
    });
  }

  // 2. Payments & Retainers Rule
  const paymentsRule = await prisma.financeSyncRule.findFirst({
    where: { companyId, sourceType: "PAYMENTS_RETAINERS" },
  });

  if (!paymentsRule) {
    // Check if legacy rule exists
    const legacyRule = await prisma.financeSyncRule.findFirst({
      where: { companyId, sourceType: "TRANSACTIONS" },
    });

    if (legacyRule) {
      // Update legacy to new type
      await prisma.financeSyncRule.update({
        where: { id: legacyRule.id },
        data: {
          sourceType: "PAYMENTS_RETAINERS",
          name: "תשלומים וריטיינרים", // Update name to reflect current purpose
        },
      });
    } else {
      // Create new
      await prisma.financeSyncRule.create({
        data: {
          companyId,
          name: "תשלומים וריטיינרים",
          sourceType: "PAYMENTS_RETAINERS",
          targetType: "INCOME",
          fieldMapping: {},
        },
      });
    }
  }
}

export async function triggerSyncByType(
  companyId: number,
  sourceType: "FIXED_EXPENSES" | "PAYMENTS_RETAINERS",
) {
  try {
    const rule = await prisma.financeSyncRule.findFirst({
      where: {
        companyId,
        sourceType,
        isActive: true, // Only trigger active rules
      },
    });

    if (rule) {
      // Run in background without awaiting if possible, but Server Actions await result usually.
      // We await it to ensure consistency, but wrap in try-catch to not block UI on error.
      await runSyncRule(rule.id);
      console.log(`[AutoSync] Triggered sync for ${sourceType}`);
    }
  } catch (error) {
    console.error(`[AutoSync] Failed to trigger sync for ${sourceType}`, error);
  }
}
