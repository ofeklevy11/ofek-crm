"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";

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

/**
 * Enqueue a finance sync job to run in the background via Inngest.
 * Returns immediately with the jobId for polling.
 */
export async function enqueueSyncJob(ruleId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const rule = await prisma.financeSyncRule.findFirst({
    where: { id: ruleId, companyId: user.companyId },
  });

  if (!rule)
    throw new Error("Rule not found");

  // Dedup: skip if there's already a QUEUED or RUNNING job for this rule
  const existingJob = await prisma.financeSyncJob.findFirst({
    where: {
      syncRuleId: ruleId,
      companyId: user.companyId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });

  if (existingJob) {
    return { jobId: existingJob.id };
  }

  const job = await prisma.financeSyncJob.create({
    data: {
      companyId: user.companyId,
      syncRuleId: ruleId,
      status: "QUEUED",
    },
  });

  await inngest.send({
    id: `finance-sync-${user.companyId}-${ruleId}-${job.id}`,
    name: "finance-sync/job.started",
    data: {
      jobId: job.id,
      syncRuleId: ruleId,
      companyId: user.companyId,
    },
  });

  return { jobId: job.id };
}

/**
 * Core sync logic extracted for background execution.
 * Does NOT call getCurrentUser() or revalidatePath() — safe for Inngest context.
 */
export async function executeSyncRule(ruleId: number, companyId: number) {
  const rule = await prisma.financeSyncRule.findFirst({
    where: { id: ruleId, companyId },
  });

  if (!rule)
    throw new Error("Rule not found");

  let stats = {
    scanned: 0,
    created: 0,
    updated: 0,
    skippedExists: 0,
    skippedError: 0,
    errors: [] as string[],
  };

  // Track all valid origin IDs during sync — reused for garbage collection
  const currentOriginIds: string[] = [];

  if (rule.sourceType === "TABLE" && rule.sourceId) {
    // --- TABLE SOURCE ---
    const records = await prisma.record.findMany({
      where: { tableId: rule.sourceId, companyId },
      select: { id: true, data: true, createdAt: true },
      take: 5000, // P76: Bound table records query
    });

    stats.scanned = records.length;
    const mapping = rule.fieldMapping as any as SyncMapping;

    // Collect origin IDs for GC reuse
    records.forEach((r) => currentOriginIds.push(r.id.toString()));

    // Batch: fetch all existing finance records for this rule in one query
    const existingRecords = await prisma.financeRecord.findMany({
      where: { syncRuleId: rule.id },
      select: { id: true, originId: true, amount: true, title: true, type: true, category: true, date: true, clientId: true },
      take: 5000, // P76: Bound existing records query
    });
    const existingMap = new Map(existingRecords.map((r) => [r.originId, r]));

    // Prepare batch arrays
    const toCreate: any[] = [];
    const toUpdate: { id: number; data: any }[] = [];

    for (const record of records) {
      const parsed = parseTableRecord(record.id.toString(), record.data, mapping, record.createdAt);
      if (parsed.status === "error") {
        stats.skippedError++;
        if (stats.errors.length < 5)
          stats.errors.push(`Record #${record.id}: ${parsed.error}`);
        continue;
      }

      const originId = record.id.toString();
      const existing = existingMap.get(originId);

      if (!existing) {
        toCreate.push({
          companyId,
          title: parsed.title,
          amount: parsed.amount,
          type: rule.targetType,
          category: parsed.category,
          date: parsed.date,
          status: "COMPLETED",
          syncRuleId: rule.id,
          originId,
        });
      } else {
        const isDifferent =
          Number(existing.amount) !== parsed.amount ||
          existing.title !== parsed.title ||
          existing.type !== rule.targetType ||
          existing.category !== parsed.category ||
          existing.date.getTime() !== parsed.date.getTime();

        if (isDifferent) {
          toUpdate.push({
            id: existing.id,
            data: {
              title: parsed.title,
              amount: parsed.amount,
              type: rule.targetType,
              category: parsed.category,
              date: parsed.date,
            },
          });
        } else {
          stats.skippedExists++;
        }
      }
    }

    // Batch create
    if (toCreate.length > 0) {
      await prisma.financeRecord.createMany({ data: toCreate });
      stats.created = toCreate.length;
    }

    // Batch update (Prisma doesn't have updateMany with different data, so we use Promise.all in chunks)
    if (toUpdate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map((u) =>
            prisma.financeRecord.update({ where: { id: u.id, companyId }, data: u.data }),
          ),
        );
      }
      stats.updated = toUpdate.length;
    }
  } else if (
    rule.sourceType === "TRANSACTIONS" ||
    rule.sourceType === "PAYMENTS_RETAINERS"
  ) {
    // --- SYSTEM PAYMENTS SOURCE ---
    const transactions = await prisma.transaction.findMany({
      where: {
        client: { companyId },
        status: { in: ["manual-marked-paid", "paid", "Pd", "PAID"] },
      },
      include: { client: true },
      take: 5000, // P76: Bound transactions query
    });

    const payments = await prisma.oneTimePayment.findMany({
      where: {
        client: { companyId },
        status: { in: ["paid", "PAID"] },
      },
      include: { client: true },
      take: 5000, // P76: Bound payments query
    });

    stats.scanned = transactions.length + payments.length;

    // Collect origin IDs for GC reuse
    transactions.forEach((t) => currentOriginIds.push(`trans_${t.id}`));
    payments.forEach((p) => currentOriginIds.push(`payment_${p.id}`));

    // Batch: fetch all existing finance records for this rule in one query
    const existingRecords = await prisma.financeRecord.findMany({
      where: { syncRuleId: rule.id },
      select: { id: true, originId: true, amount: true, title: true, type: true, category: true, date: true, clientId: true },
      take: 5000, // P76: Bound existing records query
    });
    const existingMap = new Map(existingRecords.map((r) => [r.originId, r]));

    const toCreate: any[] = [];
    const toUpdate: { id: number; data: any }[] = [];

    for (const t of transactions) {
      try {
        const date = t.paidDate || t.attemptDate || t.createdAt;
        const title = t.notes || `System Transaction #${t.id}`;
        const amount =
          Math.round((Number(t.amount) + Number.EPSILON) * 100) / 100;

        if (amount <= 0) {
          stats.skippedError++;
          continue;
        }

        const originId = `trans_${t.id}`;
        const targetType = rule.targetType;
        const existing = existingMap.get(originId);

        if (!existing) {
          toCreate.push({
            companyId,
            title,
            amount,
            type: targetType,
            category: "System Transaction",
            date,
            status: "COMPLETED",
            syncRuleId: rule.id,
            originId,
            clientId: t.clientId,
          });
        } else {
          const isDifferent =
            Number(existing.amount) !== amount ||
            existing.title !== title ||
            existing.type !== targetType ||
            existing.category !== "System Transaction" ||
            existing.date.getTime() !== date.getTime() ||
            (t.clientId && existing.clientId !== t.clientId);

          if (isDifferent) {
            toUpdate.push({
              id: existing.id,
              data: { title, amount, type: targetType, category: "System Transaction", date, clientId: t.clientId },
            });
          } else {
            stats.skippedExists++;
          }
        }
      } catch (err) {
        stats.skippedError++;
        if (stats.errors.length < 5)
          stats.errors.push(`Transaction #${t.id}: ${err}`);
      }
    }

    for (const p of payments) {
      try {
        const date = p.paidDate || p.dueDate || p.createdAt;
        const title = p.title || `Payment #${p.id}`;
        const amount =
          Math.round((Number(p.amount) + Number.EPSILON) * 100) / 100;

        if (amount <= 0) {
          stats.skippedError++;
          continue;
        }

        const originId = `payment_${p.id}`;
        const existing = existingMap.get(originId);

        if (!existing) {
          toCreate.push({
            companyId,
            title,
            amount,
            type: "INCOME",
            category: "Payment System",
            date,
            status: "COMPLETED",
            syncRuleId: rule.id,
            originId,
            clientId: p.clientId,
          });
        } else {
          const isDifferent =
            Number(existing.amount) !== amount ||
            existing.title !== title ||
            existing.type !== "INCOME" ||
            existing.category !== "Payment System" ||
            existing.date.getTime() !== date.getTime() ||
            (p.clientId && existing.clientId !== p.clientId);

          if (isDifferent) {
            toUpdate.push({
              id: existing.id,
              data: { title, amount, type: "INCOME", category: "Payment System", date, clientId: p.clientId },
            });
          } else {
            stats.skippedExists++;
          }
        }
      } catch (err) {
        stats.skippedError++;
        if (stats.errors.length < 5)
          stats.errors.push(`Payment #${p.id}: ${err}`);
      }
    }

    // Batch create
    if (toCreate.length > 0) {
      await prisma.financeRecord.createMany({ data: toCreate });
      stats.created = toCreate.length;
    }

    // Batch update in chunks
    if (toUpdate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map((u) =>
            prisma.financeRecord.update({ where: { id: u.id, companyId }, data: u.data }),
          ),
        );
      }
      stats.updated = toUpdate.length;
    }
  } else if (rule.sourceType === "FIXED_EXPENSES") {
    // --- FIXED EXPENSES SOURCE ---
    const { processFixedExpenses } = await import("./fixed-expenses");
    const generatedCount = (await processFixedExpenses()) || 0;

    const unlinkedRecords = await prisma.financeRecord.findMany({
      where: {
        companyId,
        originId: { startsWith: "fixed_" },
        syncRuleId: null,
      },
      take: 5000, // P88: Bound unlinked records query
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
      stats.created = generatedCount;
      stats.updated = unlinkedRecords.length;
    } else {
      stats.created = generatedCount;
    }
  }

  // --- GARBAGE COLLECTION (reuses currentOriginIds from sync phase) ---
  if (
    currentOriginIds.length > 0 &&
    rule.sourceType !== "FIXED_EXPENSES"
  ) {
    await prisma.financeRecord.deleteMany({
      where: {
        syncRuleId: rule.id,
        companyId,
        originId: { notIn: currentOriginIds },
      },
    });
  } else if (
    currentOriginIds.length === 0 &&
    (rule.sourceType === "TRANSACTIONS" ||
      rule.sourceType === "PAYMENTS_RETAINERS" ||
      rule.sourceType === "TABLE")
  ) {
    await prisma.financeRecord.deleteMany({
      where: { syncRuleId: rule.id, companyId },
    });
  }

  console.log(`Sync Rule #${ruleId} Finished:`, stats);
  return stats;
}

// --- HELPERS ---

/** Pure parsing function — no DB calls. Returns parsed data or error. */
function parseTableRecord(
  originId: string,
  data: any,
  mapping: SyncMapping,
  defaultDate: Date,
): {
  status: "ok" | "error";
  error?: string;
  title: string;
  amount: number;
  date: Date;
  category: string;
} {
  const rawAmount = data[mapping.amountField];

  if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
    return {
      status: "error",
      error: `Missing amount in field '${mapping.amountField}'`,
      title: "",
      amount: 0,
      date: defaultDate,
      category: "",
    };
  }

  let rawDate = mapping.dateField ? data[mapping.dateField] : defaultDate;
  if (!rawDate) rawDate = defaultDate;

  const title = data[mapping.titleField] || `Imported #${originId}`;

  const category = mapping.categoryField
    ? data[mapping.categoryField]
    : mapping.categoryValue || "General";

  let amount = 0;
  if (typeof rawAmount === "number") amount = rawAmount;
  else if (typeof rawAmount === "string") {
    const cleaned = rawAmount.replace(/[^0-9.-]+/g, "");
    amount = parseFloat(cleaned);
  }

  amount = Math.round((amount + Number.EPSILON) * 100) / 100;

  if (isNaN(amount) || amount === 0) {
    return { status: "error", error: `Invalid amount value: ${rawAmount}`, title: "", amount: 0, date: defaultDate, category: "" };
  }

  let date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (isNaN(date.getTime())) {
    date = defaultDate;
    if (isNaN(date.getTime())) {
      return { status: "error", error: `Invalid date value: ${rawDate}`, title: "", amount: 0, date: defaultDate, category: "" };
    }
  }

  return { status: "ok", title, amount, date, category };
}

export async function deleteSyncRule(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Delete all finance records created by this rule (scoped to company)
  await prisma.financeRecord.deleteMany({
    where: { syncRuleId: id, companyId: user.companyId },
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
    take: 200, // P76: Bound user sync rules query
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
    const legacyRule = await prisma.financeSyncRule.findFirst({
      where: { companyId, sourceType: "TRANSACTIONS" },
    });

    if (legacyRule) {
      await prisma.financeSyncRule.update({
        where: { id: legacyRule.id },
        data: {
          sourceType: "PAYMENTS_RETAINERS",
          name: "תשלומים וריטיינרים",
        },
      });
    } else {
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
        isActive: true,
      },
    });

    if (rule) {
      // Dedup: skip if there's already a QUEUED/RUNNING job for this rule
      const existingJob = await prisma.financeSyncJob.findFirst({
        where: {
          syncRuleId: rule.id,
          companyId,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });

      if (existingJob) {
        console.log(`[AutoSync] Skipping ${sourceType} — job already queued/running`);
        return;
      }

      const job = await prisma.financeSyncJob.create({
        data: {
          companyId,
          syncRuleId: rule.id,
          status: "QUEUED",
        },
      });

      await inngest.send({
        id: `finance-sync-${companyId}-${rule.id}-${job.id}`,
        name: "finance-sync/job.started",
        data: {
          jobId: job.id,
          syncRuleId: rule.id,
          companyId,
        },
      });

      console.log(`[AutoSync] Enqueued sync job for ${sourceType}`);
    }
  } catch (error) {
    console.error(`[AutoSync] Failed to trigger sync for ${sourceType}`, error);
  }
}
