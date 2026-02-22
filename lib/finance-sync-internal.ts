/**
 * Internal finance sync functions — NOT client-callable.
 *
 * These functions accept companyId as a parameter and skip getCurrentUser()
 * because they run in background jobs (Inngest) where no user session exists.
 * They are in a regular lib file (no "use server" directive) to prevent
 * client-side invocation.
 */

import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { PAID_STATUS_VARIANTS } from "@/lib/finance-constants";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";
import { getValidDate } from "@/lib/date-utils";

const log = createLogger("FinanceSyncInternal");

export interface SyncMapping {
  amountField: string;
  dateField: string;
  titleField: string;
  categoryValue?: string;
  categoryField?: string;
}

// P10: In-memory cache — NOT shared across serverless instances.
const _defaultRulesCache = new Map<number, number>();
const DEFAULT_RULES_TTL = 60 * 60 * 1000; // 1 hour

// Throttle sync triggers to avoid re-running on every page load
const _syncTriggerCache = new Map<string, number>();
const SYNC_TRIGGER_TTL = 5 * 60 * 1000; // 5 minutes

export function shouldTriggerSync(companyId: number, sourceType: string): boolean {
  const key = `${companyId}-${sourceType}`;
  const last = _syncTriggerCache.get(key);
  if (last && Date.now() - last < SYNC_TRIGGER_TTL) return false;
  _syncTriggerCache.set(key, Date.now());
  return true;
}

export function clearDefaultRulesCache(companyId: number) {
  _defaultRulesCache.delete(companyId);
}

/** Shared helper to process sync items (transactions or payments) into create/update arrays. */
function processSyncItems<T>(
  items: T[],
  config: {
    getAmount: (item: T) => number;
    getDate: (item: T) => Date;
    getTitle: (item: T) => string;
    getOriginId: (item: T) => string;
    getClientId: (item: T) => number | null;
    getLabel: (item: T) => string;
    targetType: string;
    category: string;
  },
  existingMap: Map<string | null, any>,
  companyId: number,
  syncRuleId: number,
  stats: { skippedError: number; skippedExists: number; errors: string[] },
  toCreate: any[],
  toUpdate: { id: number; data: any }[],
) {
  for (const item of items) {
    try {
      const date = config.getDate(item);
      const title = config.getTitle(item);
      const amount = Math.round((config.getAmount(item) + Number.EPSILON) * 100) / 100;

      if (isNaN(amount) || amount <= 0) {
        stats.skippedError++;
        continue;
      }

      const originId = config.getOriginId(item);
      const clientId = config.getClientId(item);
      const existing = existingMap.get(originId);

      if (!existing) {
        toCreate.push({
          companyId,
          title,
          amount,
          type: config.targetType,
          category: config.category,
          date,
          status: "COMPLETED",
          syncRuleId,
          originId,
          clientId,
        });
      } else {
        const isDifferent =
          Number(existing.amount) !== amount ||
          existing.title !== title ||
          existing.type !== config.targetType ||
          existing.category !== config.category ||
          existing.date.getTime() !== date.getTime() ||
          (clientId && existing.clientId !== clientId);

        if (isDifferent) {
          toUpdate.push({
            id: existing.id,
            data: { title, amount, type: config.targetType, category: config.category, date, clientId },
          });
        } else {
          stats.skippedExists++;
        }
      }
    } catch (err) {
      stats.skippedError++;
      if (stats.errors.length < 5)
        stats.errors.push(`${config.getLabel(item)}: ${err}`);
    }
  }
}

/**
 * Core sync logic extracted for background execution.
 * Does NOT call getCurrentUser() or revalidatePath() — safe for Inngest context.
 */
export async function executeSyncRule(ruleId: number, companyId: number) {
  const rule = await withRetry(() => prisma.financeSyncRule.findFirst({
    where: { id: ruleId, companyId },
  }));

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
  let hitSourceLimit = false;

  if (rule.sourceType === "TABLE" && rule.sourceId) {
    // --- TABLE SOURCE ---
    const [records, existingRecords] = await Promise.all([
      withRetry(() => prisma.record.findMany({
        where: { tableId: rule.sourceId!, companyId },
        select: { id: true, data: true, createdAt: true },
        take: 5000,
      })),
      withRetry(() => prisma.financeRecord.findMany({
        where: { syncRuleId: rule.id, companyId, deletedAt: null },
        select: { id: true, originId: true, amount: true, title: true, type: true, category: true, date: true, clientId: true },
        take: 5000,
      })),
    ]);

    stats.scanned = records.length;
    if (records.length >= 5000) hitSourceLimit = true;
    const mapping = rule.fieldMapping as any as SyncMapping;

    records.forEach((r) => currentOriginIds.push(r.id.toString()));
    const existingMap = new Map(existingRecords.map((r) => [r.originId, r]));

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

    if (toCreate.length > 0) {
      const result = await withRetry(() => prisma.financeRecord.createMany({ data: toCreate, skipDuplicates: true }));
      stats.created = result.count;
    }

    if (toUpdate.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await withRetry(() => prisma.$transaction(
          batch.map((u) =>
            prisma.financeRecord.update({ where: { id: u.id, companyId }, data: u.data }),
          ) as any,
          { maxWait: 5000, timeout: 10000 },
        ));
      }
      stats.updated = toUpdate.length;
    }
  } else if (
    rule.sourceType === "TRANSACTIONS" ||
    rule.sourceType === "PAYMENTS_RETAINERS"
  ) {
    // --- SYSTEM PAYMENTS SOURCE ---
    const [transactions, payments, existingRecords] = await Promise.all([
      withRetry(() => prisma.transaction.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: { in: PAID_STATUS_VARIANTS as any },
        },
        select: { id: true, clientId: true, amount: true, paidDate: true, attemptDate: true, createdAt: true, notes: true },
        take: 5000,
      })),
      withRetry(() => prisma.oneTimePayment.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: { in: PAID_STATUS_VARIANTS as any },
        },
        select: { id: true, clientId: true, amount: true, paidDate: true, dueDate: true, createdAt: true, title: true },
        take: 5000,
      })),
      withRetry(() => prisma.financeRecord.findMany({
        where: { syncRuleId: rule.id, companyId, deletedAt: null },
        select: { id: true, originId: true, amount: true, title: true, type: true, category: true, date: true, clientId: true },
        take: 5000,
      })),
    ]);

    stats.scanned = transactions.length + payments.length;
    if (transactions.length >= 5000 || payments.length >= 5000) hitSourceLimit = true;

    transactions.forEach((t) => currentOriginIds.push(`trans_${t.id}`));
    payments.forEach((p) => currentOriginIds.push(`payment_${p.id}`));
    const existingMap = new Map(existingRecords.map((r) => [r.originId, r]));

    const toCreate: any[] = [];
    const toUpdate: { id: number; data: any }[] = [];

    processSyncItems(transactions, {
      getAmount: (t) => Number(t.amount),
      getDate: (t) => t.paidDate || t.attemptDate || t.createdAt,
      getTitle: (t) => t.notes || `System Transaction #${t.id}`,
      getOriginId: (t) => `trans_${t.id}`,
      getClientId: (t) => t.clientId,
      getLabel: (t) => `Transaction #${t.id}`,
      targetType: rule.targetType,
      category: "System Transaction",
    }, existingMap, companyId, rule.id, stats, toCreate, toUpdate);

    processSyncItems(payments, {
      getAmount: (p) => Number(p.amount),
      getDate: (p) => p.paidDate || p.dueDate || p.createdAt,
      getTitle: (p) => p.title || `Payment #${p.id}`,
      getOriginId: (p) => `payment_${p.id}`,
      getClientId: (p) => p.clientId,
      getLabel: (p) => `Payment #${p.id}`,
      targetType: "INCOME",
      category: "Payment System",
    }, existingMap, companyId, rule.id, stats, toCreate, toUpdate);

    if (toCreate.length > 0) {
      const result = await withRetry(() => prisma.financeRecord.createMany({ data: toCreate, skipDuplicates: true }));
      stats.created = result.count;
    }

    if (toUpdate.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await withRetry(() => prisma.$transaction(
          batch.map((u) =>
            prisma.financeRecord.update({ where: { id: u.id, companyId }, data: u.data }),
          ) as any,
          { maxWait: 5000, timeout: 10000 },
        ));
      }
      stats.updated = toUpdate.length;
    }
  } else if (rule.sourceType === "FIXED_EXPENSES") {
    // --- FIXED EXPENSES SOURCE ---
    const generatedCount = (await processFixedExpensesInternal(companyId)) || 0;

    const unlinkedRecords = await withRetry(() => prisma.financeRecord.findMany({
      where: {
        companyId,
        deletedAt: null,
        originId: { startsWith: "fixed_" },
        syncRuleId: null,
      },
      take: 5000,
    }));

    stats.scanned = unlinkedRecords.length;

    if (unlinkedRecords.length > 0) {
      await withRetry(() => prisma.financeRecord.updateMany({
        where: {
          id: { in: unlinkedRecords.map((r) => r.id) },
          companyId,
        },
        data: {
          syncRuleId: rule.id,
        },
      }));
      stats.created = generatedCount;
      stats.updated = unlinkedRecords.length;
    } else {
      stats.created = generatedCount;
    }
  }

  // --- GARBAGE COLLECTION ---
  if (
    currentOriginIds.length > 0 &&
    !hitSourceLimit &&
    rule.sourceType !== "FIXED_EXPENSES"
  ) {
    await withRetry(() => prisma.$executeRaw`
      DELETE FROM "FinanceRecord"
      WHERE "syncRuleId" = ${rule.id}
        AND "companyId" = ${companyId}
        AND "deletedAt" IS NULL
        AND "originId" IS NOT NULL
        AND "originId" NOT IN (SELECT unnest(${currentOriginIds}::text[]))
    `);
  } else if (
    currentOriginIds.length === 0 &&
    (rule.sourceType === "TRANSACTIONS" ||
      rule.sourceType === "PAYMENTS_RETAINERS" ||
      rule.sourceType === "TABLE")
  ) {
    await withRetry(() => prisma.financeRecord.deleteMany({
      where: { syncRuleId: rule.id, companyId, deletedAt: null },
    }));
  }

  log.info("Sync rule finished", { ruleId, stats });
  return stats;
}

/** Pure parsing function — no DB calls. */
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

export async function ensureDefaultSyncRules(companyId: number) {
  const cached = _defaultRulesCache.get(companyId);
  if (cached && Date.now() - cached < DEFAULT_RULES_TTL) return;

  await withRetry(() => prisma.$transaction(async (tx) => {
    const existingRules = await tx.financeSyncRule.findMany({
      where: { companyId, sourceType: { in: ["FIXED_EXPENSES", "PAYMENTS_RETAINERS", "TRANSACTIONS"] } },
      select: { id: true, sourceType: true },
    });

    const sourceTypes = new Set(existingRules.map((r) => r.sourceType));

    if (!sourceTypes.has("FIXED_EXPENSES")) {
      await tx.financeSyncRule.create({
        data: {
          companyId,
          name: "הוצאות קבועות",
          sourceType: "FIXED_EXPENSES",
          targetType: "EXPENSE",
          fieldMapping: {},
        },
      });
    }

    if (!sourceTypes.has("PAYMENTS_RETAINERS")) {
      const legacyRule = existingRules.find((r) => r.sourceType === "TRANSACTIONS");

      if (legacyRule) {
        await tx.financeSyncRule.update({
          where: { id: legacyRule.id },
          data: {
            sourceType: "PAYMENTS_RETAINERS",
            name: "תשלומים וריטיינרים",
          },
        });
      } else {
        await tx.financeSyncRule.create({
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
  }, { maxWait: 5000, timeout: 10000 }));

  _defaultRulesCache.set(companyId, Date.now());
}

/**
 * Internal processFixedExpenses — accepts companyId directly.
 * Safe for Inngest background jobs. NOT client-callable (no "use server").
 */
export async function processFixedExpensesInternal(
  companyId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalPrisma?: any,
) {
  const db = (externalPrisma ?? prisma) as typeof prisma;

  // P1: Resolve FIXED_EXPENSES sync rule so @@unique([syncRuleId, originId]) prevents duplicates
  // All 3 queries are independent reads — run in parallel to save 2 RTTs
  const [fixedExpenseRule, expenses, existingRecords] = await Promise.all([
    withRetry(() => db.financeSyncRule.findFirst({
      where: { companyId, sourceType: "FIXED_EXPENSES", isActive: true },
      select: { id: true },
    })),
    withRetry(() => db.fixedExpense.findMany({
      where: {
        companyId,
        status: "ACTIVE",
      },
      take: 500,
    })),
    // P123: Pre-fetch all existing originIds to avoid N+1 queries
    withRetry(() => db.financeRecord.findMany({
      where: {
        companyId,
        deletedAt: null,
        originId: { startsWith: "fixed_" },
      },
      select: { originId: true },
    })),
  ]);
  const existingOriginIds = new Set(existingRecords.map((r) => r.originId));

  const today = new Date();
  const toCreate: {
    companyId: number;
    title: string;
    amount: any;
    type: string;
    category: string;
    date: Date;
    status: string;
    description: string;
    originId: string;
    syncRuleId: number | null;
  }[] = [];

  for (const expense of expenses) {
    const startDate = expense.startDate || expense.createdAt;
    const frequency = expense.frequency;
    const payDay = expense.payDay || startDate.getDate();
    const baseOriginId = `fixed_${expense.id}`;

    let year = startDate.getFullYear();
    let month = startDate.getMonth();

    let checkDate = getValidDate(year, month, payDay);

    if (checkDate < startDate) {
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      checkDate = getValidDate(year, month, payDay);
    }

    while (checkDate <= today) {
      const yStr = checkDate.getFullYear();
      const mStr = checkDate.getMonth() + 1;
      const dStr = checkDate.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

      const exists = existingOriginIds.has(originId);

      if (!exists) {
        toCreate.push({
          companyId,
          title: expense.title,
          amount: expense.amount,
          type: "EXPENSE",
          category: expense.category || "Fixed Expense",
          date: new Date(checkDate),
          status: "COMPLETED",
          description: expense.description || `Fixed Expense: ${frequency}`,
          originId: originId,
          syncRuleId: fixedExpenseRule?.id ?? null,
        });
      }

      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;

      checkDate = getValidDate(year, month, payDay);
    }
  }

  if (toCreate.length > 0) {
    await withRetry(() => db.financeRecord.createMany({ data: toCreate as any, skipDuplicates: true }));
  }

  return toCreate.length;
}

export async function triggerSyncByType(
  companyId: number,
  sourceType: "FIXED_EXPENSES" | "PAYMENTS_RETAINERS",
) {
  try {
    const rule = await withRetry(() => prisma.financeSyncRule.findFirst({
      where: {
        companyId,
        sourceType,
        isActive: true,
      },
      select: { id: true },
    }));

    if (rule) {
      const result = await withRetry(() => prisma.$transaction(async (tx) => {
        const existingJob = await tx.financeSyncJob.findFirst({
          where: {
            syncRuleId: rule.id,
            companyId,
            status: { in: ["QUEUED", "RUNNING"] },
          },
        });

        if (existingJob) {
          return { jobId: existingJob.id, isNew: false };
        }

        const job = await tx.financeSyncJob.create({
          data: {
            companyId,
            syncRuleId: rule.id,
            status: "QUEUED",
          },
        });

        return { jobId: job.id, isNew: true };
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }));

      if (!result.isNew) {
        log.info("Skipping sync — job already queued/running", { sourceType });
        return;
      }

      await inngest.send({
        id: `finance-sync-${companyId}-${rule.id}-${result.jobId}`,
        name: "finance-sync/job.started",
        data: {
          jobId: result.jobId,
          syncRuleId: rule.id,
          companyId,
        },
      });

      log.info("Enqueued sync job", { sourceType });
    }
  } catch (error) {
    log.error("Failed to trigger sync", { sourceType, error: String(error) });
  }
}
