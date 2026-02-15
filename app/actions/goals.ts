"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { GoalMetricType, GoalTargetType, GoalPeriodType } from "@prisma/client";
import { startOfDay, endOfDay } from "date-fns";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";

export type MetricType = GoalMetricType;
export type TargetType = GoalTargetType;
export type PeriodType = GoalPeriodType;

export interface GoalFilters {
  clientId?: number;
  frequency?: string;
  status?: string;
  tableId?: number; // For revenue from specific table
  source?: string; // 'TRANSACTIONS' | 'TABLE' | 'FINANCE_RECORD'
  columnKey?: string; // If source=TABLE, which column to sum. If source=FINANCE_RECORD, acts as category filter
  searchQuery?: string; // For calendar events or general text search
  taskGoalMode?: "COUNT" | "REDUCE"; // For tasks: COUNT = count tasks reaching status, REDUCE = count remaining tasks
}

export interface GoalFormData {
  name: string;
  metricType: MetricType;
  targetType: TargetType;
  targetValue: number;
  periodType: PeriodType;
  startDate: Date;
  endDate: Date;
  filters: GoalFilters;
  warningThreshold?: number;
  criticalThreshold?: number;
  notes?: string;
  isActive?: boolean;
}

export interface GoalWithProgress {
  id: number;
  name: string;
  metricType: string;
  targetType: string;
  targetValue: number;
  currentValue: number;
  progressPercent: number;
  periodType: string;
  startDate: Date;
  endDate: Date;
  filters: GoalFilters;
  warningThreshold: number;
  criticalThreshold: number;
  status: "ON_TRACK" | "WARNING" | "CRITICAL" | "EXCEEDED";
  isActive: boolean;
  isArchived: boolean;
  notes: string | null;
  daysRemaining: number;
  projectedValue: number;
  recommendation: string | null;
}

// Validates field names used in raw SQL JSON accessors — prevents data probing via arbitrary keys
const SAFE_FIELD_NAME = /^[a-zA-Z0-9_\u0590-\u05FF]+$/;

const VALID_METRIC_TYPES = new Set<string>(["REVENUE", "SALES", "CUSTOMERS", "TASKS", "RETAINERS", "QUOTES", "CALENDAR", "RECORDS"]);
const VALID_TARGET_TYPES = new Set<string>(["COUNT", "SUM"]);
const VALID_PERIOD_TYPES = new Set<string>(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]);

// Helper for live preview in the UI - exposed to client
export async function previewGoalValue(
  metricType: MetricType,
  targetType: TargetType,
  periodType: PeriodType,
  startDate: Date,
  endDate: Date,
  filters: GoalFilters,
) {
  if (!VALID_METRIC_TYPES.has(metricType)) throw new Error("Invalid metricType");
  if (!VALID_TARGET_TYPES.has(targetType)) throw new Error("Invalid targetType");
  if (!VALID_PERIOD_TYPES.has(periodType)) throw new Error("Invalid periodType");
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) throw new Error("Invalid startDate");
  if (!(endDate instanceof Date) || isNaN(endDate.getTime())) throw new Error("Invalid endDate");

  const user = await getCurrentUser();
  if (!user) return 0;

  return await calculateMetricValue(
    metricType,
    targetType,
    user.companyId,
    startDate,
    endDate,
    filters,
  );
}

// Create a new goal
export async function createGoal(data: GoalFormData) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Cross-field validation (defense-in-depth — server action may be called outside the API route)
  if (data.endDate < data.startDate) throw new Error("endDate must be >= startDate");
  if ((data.warningThreshold ?? 70) < (data.criticalThreshold ?? 50))
    throw new Error("warningThreshold must be >= criticalThreshold");

  const goal = await withRetry(() => prisma.goal.create({
    data: {
      companyId: user.companyId,
      name: data.name,
      metricType: data.metricType,
      targetValue: data.targetValue,
      periodType: data.periodType,
      startDate: data.startDate,
      endDate: data.endDate,
      warningThreshold: data.warningThreshold ?? 70,
      criticalThreshold: data.criticalThreshold ?? 50,
      notes: data.notes ?? null,
      isActive: true,
      isArchived: false,
      filters: data.filters as any,
      targetType: data.targetType as any,
    },
  }));

  revalidatePath("/finance/goals");

  // Trigger dashboard goals cache refresh (fire-and-forget — non-critical)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => console.error("[Goals] Failed to send dashboard refresh:", e));

  return { ...goal, targetValue: Number(goal.targetValue) };
}

// Archive/Restore Goal
export async function toggleGoalArchive(id: number, isArchived: boolean) {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid goal id");
  if (typeof isArchived !== "boolean") throw new Error("Invalid isArchived");

  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (isArchived) {
    // Compute final progress snapshot before archiving (avoids re-computing for archived goals)
    // Wrapped in transaction to prevent TOCTOU race — re-read filters at write time
    const goalRow = await withRetry(() => prisma.goal.findUnique({ where: { id, companyId: user.companyId } }));
    if (goalRow) {
      const enriched = await enrichGoalsWithProgress([goalRow], user.companyId);
      const snapshot = enriched[0];
      await prisma.$transaction(async (tx) => {
        // Re-read inside transaction to get fresh filters (may have changed during enrichment)
        const freshGoal = await tx.goal.findUnique({ where: { id, companyId: user.companyId } });
        if (!freshGoal) return;
        const freshFilters = (freshGoal.filters as any) || {};
        await tx.goal.update({
          where: { id, companyId: user.companyId },
          data: {
            isArchived: true,
            filters: {
              ...freshFilters,
              _archivedSnapshot: {
                currentValue: snapshot?.currentValue ?? 0,
                progressPercent: snapshot?.progressPercent ?? 0,
                status: snapshot?.status ?? "CRITICAL",
                projectedValue: snapshot?.projectedValue ?? 0,
                daysRemaining: snapshot?.daysRemaining ?? 0,
                recommendation: snapshot?.recommendation ?? null,
                archivedAt: new Date().toISOString(),
              },
            },
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    }
  } else {
    await withRetry(() => prisma.goal.update({
      where: { id, companyId: user.companyId },
      data: { isArchived: false },
    }));
  }

  // Trigger dashboard goals cache refresh (fire-and-forget — non-critical)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => console.error("[Goals] Failed to send dashboard refresh:", e));

  revalidatePath("/finance/goals");
  revalidatePath("/finance/goals/archive");
}

// Utility to build dynamic where clause based on time period
function getDateFilter(
  startDate: Date,
  endDate: Date,
  field: string = "createdAt",
) {
  return {
    [field]: {
      gte: startDate,
      lte: endDate,
    },
  };
}

async function calculateMetricValue(
  metricType: string,
  targetType: string, // 'COUNT' | 'SUM'
  companyId: number,
  startDateRaw: Date,
  endDateRaw: Date,
  filters: GoalFilters,
): Promise<number> {
  // Normalize dates to ensure full day coverage
  const startDate = startOfDay(startDateRaw);
  const endDate = endOfDay(endDateRaw);

  // Common filters
  const clientFilter = filters.clientId ? { clientId: filters.clientId } : {};

  switch (metricType) {
    case "RETAINERS": {
      const where: any = {
        companyId, // Denormalized — no JOIN to Client needed
        status: { in: ["active", "Active", "ACTIVE"] },
        ...clientFilter,
      };

      if (filters.frequency && filters.frequency !== "all") {
        where.frequency = filters.frequency;
      }

      if (targetType?.toUpperCase() === "SUM") {
        const result = await withRetry(() => prisma.retainer.aggregate({
          where,
          _sum: { amount: true },
        }));
        return Number(result._sum.amount ?? 0);
      } else {
        return await withRetry(() => prisma.retainer.count({ where }));
      }
    }

    case "REVENUE":
    case "SALES": {
      // Option A: Finance Module (Unified Ledger)
      if (filters.source === "FINANCE_RECORD") {
        const type = "INCOME"; // We usually track Income goals. For expense goals, we might need a flag.
        // Note: If user wants to track expenses reduction, metricType might still be 'REVENUE' in the current simple model,
        // or we'd add 'EXPENSES' metric type. For now, assuming Income Goal.

        const where: any = {
          companyId,
          type,
          ...getDateFilter(startDate, endDate, "date"),
        };

        // Use columnKey as a category filter if provided
        if (filters.columnKey && filters.columnKey !== "all") {
          where.category = filters.columnKey;
        }

        if (targetType?.toUpperCase() === "SUM" || metricType === "REVENUE") {
          const result = await withRetry(() => prisma.financeRecord.aggregate({
            where,
            _sum: { amount: true },
          }));
          return Number(result._sum.amount ?? 0);
        } else {
          return await withRetry(() => prisma.financeRecord.count({ where }));
        }
      }

      // Option B: Revenue from Specific Table (e.g. "Deals")
      if (filters.source === "TABLE" && filters.tableId && filters.columnKey) {
        // SECURITY: Validate columnKey before using in raw SQL JSON accessor
        if (!SAFE_FIELD_NAME.test(filters.columnKey)) return 0;

        if (targetType?.toUpperCase() === "SUM") {
          // DB-level SUM: avoids loading 5000 full data blobs into memory
          const result = await withRetry(() => prisma.$queryRaw<[{ total: string | null }]>`
            SELECT COALESCE(SUM(
              NULLIF(regexp_replace("data"->>${filters.columnKey!}, '[^0-9.\\-]', '', 'g'), '')::numeric
            ), 0)::text as total
            FROM "Record"
            WHERE "companyId" = ${companyId} AND "tableId" = ${filters.tableId}
              AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
          `);
          return Number(result[0].total ?? 0);
        } else {
          return await withRetry(() => prisma.record.count({
            where: { companyId, tableId: filters.tableId, createdAt: { gte: startDate, lte: endDate } },
          }));
        }
      }

      // Option C: Revenue from Payments System (Transactions + OneTimePayments)
      // We sum up both sources to ensure coverage of both legacy and new systems.

      // 1. Transactions (Legacy)
      const transactionWhere: any = {
        companyId, // Denormalized — no JOIN to Client needed
        status: {
          in: ["manual-marked-paid", "paid", "PAID", "completed", "COMPLETED"],
        },
        ...clientFilter,
        OR: [
          { paidDate: { gte: startDate, lte: endDate } },
          {
            paidDate: null,
            updatedAt: { gte: startDate, lte: endDate },
          },
        ],
      };

      // 2. OneTimePayments (Modern)
      const paymentWhere: any = {
        companyId, // Denormalized — no JOIN to Client needed
        status: {
          in: ["paid", "PAID", "Pd", "manual-marked-paid", "completed"],
        },
        ...clientFilter,
        OR: [
          { paidDate: { gte: startDate, lte: endDate } },
          {
            paidDate: null,
            dueDate: { gte: startDate, lte: endDate }, // Fallback to due date if no paid date? Or updatedAt?
          },
          // Also check updatedAt if neither paid nor due (though strictly paidDate is best)
          {
            paidDate: null,
            updatedAt: { gte: startDate, lte: endDate },
          },
        ],
      };

      // Apply Filter Specifics
      if (filters.source === "TRANSACTIONS_RETAINER") {
        // Transactions: Only relatedType = 'retainer'
        transactionWhere.relatedType = "retainer";

        // Payments: Only notes containing 'ret' / 'ריטיינר'
        // Using OR because "contains" is case sensitive often, and Hebrew vs English
        paymentWhere.OR = paymentWhere.OR.map((dateCond: any) => ({
          AND: [
            dateCond,
            {
              OR: [
                { notes: { contains: "ריטיינר" } },
                { notes: { contains: "Retainer", mode: "insensitive" } },
              ],
            },
          ],
        }));
      } else if (filters.source === "TRANSACTIONS_ONE_TIME") {
        // Transactions: Exclude 'retainer'
        transactionWhere.relatedType = { not: "retainer" };

        // Payments: Exclude 'ret' / 'ריטיינר'
        // Using AND NOT
        paymentWhere.AND = [
          {
            NOT: {
              notes: { contains: "ריטיינר" },
            },
          },
          {
            NOT: {
              notes: { contains: "Retainer", mode: "insensitive" },
            },
          },
        ];
      }

      // Execute Queries
      let totalAmount = 0;
      let totalCount = 0;

      const [transSum, transCount, paySum, payCount] = await Promise.all([
        withRetry(() => prisma.transaction.aggregate({
          where: transactionWhere,
          _sum: { amount: true },
        })),
        withRetry(() => prisma.transaction.count({ where: transactionWhere })),
        withRetry(() => prisma.oneTimePayment.aggregate({
          where: paymentWhere,
          _sum: { amount: true },
        })),
        withRetry(() => prisma.oneTimePayment.count({ where: paymentWhere })),
      ]);

      totalAmount =
        Number(transSum._sum.amount ?? 0) + Number(paySum._sum.amount ?? 0);
      totalCount = transCount + payCount;

      if (targetType?.toUpperCase() === "SUM" || metricType === "REVENUE") {
        return totalAmount;
      } else {
        return totalCount;
      }
    }

    case "CUSTOMERS": {
      if (filters.tableId) {
        const where: any = {
          companyId,
          tableId: filters.tableId,
          ...getDateFilter(startDate, endDate, "createdAt"),
        };
        return await withRetry(() => prisma.record.count({ where }));
      }

      const where: any = {
        companyId,
        ...getDateFilter(startDate, endDate, "createdAt"),
      };
      return await withRetry(() => prisma.client.count({ where }));
    }

    case "TASKS": {
      // Status mapping to actual task statuses in the system
      const statusMap: Record<string, string[]> = {
        TODO: ["todo", "Todo", "TODO"],
        IN_PROGRESS: ["in_progress", "In Progress", "IN_PROGRESS"],
        WAITING_CLIENT: ["waiting_client", "Waiting Client", "WAITING_CLIENT"],
        ON_HOLD: ["on_hold", "On Hold", "ON_HOLD"],
        COMPLETED: [
          "completed_month",
          "Completed",
          "completed",
          "done",
          "Done",
        ],
      };

      // REDUCE mode: Count how many tasks currently remain in the status (live count, no date filter)
      if (filters.taskGoalMode === "REDUCE") {
        const statusValues = filters.status
          ? statusMap[filters.status] || [filters.status]
          : statusMap.TODO;

        const where: any = {
          companyId,
          status: { in: statusValues },
        };

        return await withRetry(() => prisma.task.count({ where }));
      }

      // COUNT mode (default): Count tasks that reached the status in the date range
      const statusValues = filters.status
        ? statusMap[filters.status] || [filters.status]
        : statusMap.COMPLETED;

      const where: any = {
        companyId,
        status: { in: statusValues },
        ...getDateFilter(startDate, endDate, "updatedAt"),
      };

      return await withRetry(() => prisma.task.count({ where }));
    }

    case "QUOTES": {
      const where: any = {
        companyId,
        isTrashed: false,
        ...clientFilter,
        ...getDateFilter(startDate, endDate, "createdAt"),
      };

      if (filters.status && filters.status !== "all") {
        where.status = filters.status;
      }

      if (targetType?.toUpperCase() === "SUM") {
        const result = await withRetry(() => prisma.quote.aggregate({
          where,
          _sum: { total: true },
        }));
        return Number(result._sum.total ?? 0);
      } else {
        return await withRetry(() => prisma.quote.count({ where }));
      }
    }

    case "CALENDAR": {
      const where: any = {
        companyId,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (filters.searchQuery) {
        where.OR = [
          { title: { contains: filters.searchQuery, mode: "insensitive" } },
          {
            description: { contains: filters.searchQuery, mode: "insensitive" },
          },
        ];
      }

      return await withRetry(() => prisma.calendarEvent.count({ where }));
    }

    case "RECORDS": {
      if (!filters.tableId) return 0;

      const where: any = {
        companyId,
        tableId: filters.tableId,
        ...getDateFilter(startDate, endDate, "createdAt"),
      };

      if (targetType?.toUpperCase() === "SUM" && filters.columnKey) {
        // SECURITY: Validate columnKey before using in raw SQL JSON accessor
        if (!SAFE_FIELD_NAME.test(filters.columnKey)) return 0;

        // DB-level SUM: avoids loading full data blobs into memory
        const result = await withRetry(() => prisma.$queryRaw<[{ total: string | null }]>`
          SELECT COALESCE(SUM(
            NULLIF(regexp_replace("data"->>${filters.columnKey!}, '[^0-9.\\-]', '', 'g'), '')::numeric
          ), 0)::text as total
          FROM "Record"
          WHERE "companyId" = ${companyId} AND "tableId" = ${filters.tableId}
            AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        `);
        return Number(result[0].total ?? 0);
      }

      return await withRetry(() => prisma.record.count({ where }));
    }

    default:
      return 0;
  }
}

function generateRecommendation(
  metricType: string,
  progress: number,
  targetType: string,
  daysRemaining: number,
  gap: number,
): string | null {
  if (gap <= 0) return "🎉 יעד הושג! כל הכבוד.";
  if (daysRemaining <= 0) return "⌛ הזמן עבר.";

  const dailyPace = gap / daysRemaining;
  const unit = targetType?.toUpperCase() === "SUM" ? "₪" : "יח׳";

  if (progress >= 80) return "🚀 ממש בקרוב, המשך כך!";

  if (metricType === "RETAINERS") {
    return `💡 כדי להגיע ליעד, צריך להוסיף עוד ${Math.ceil(
      gap,
    ).toLocaleString()} ${unit} לריטיינר החודשי.`;
  }

  return `👉 נדרש קצב של ${Math.ceil(
    dailyPace,
  ).toLocaleString()} ${unit} ליום כדי לעמוד ביעד.`;
}

/**
 * Build a batch key for grouping goals that can share pre-fetched data.
 * Goals with the same key have identical query structures (only date ranges differ).
 */
function goalBatchKey(goal: any): string {
  const f = ((goal as any).filters as GoalFilters) || {};
  switch (goal.metricType) {
    case "TASKS": {
      const mode = f.taskGoalMode || "COUNT";
      const status = f.status || (mode === "REDUCE" ? "TODO" : "COMPLETED");
      return `TASKS|${mode}|${status}`;
    }
    case "REVENUE":
    case "SALES": {
      if (f.source === "FINANCE_RECORD") return `FIN_REC|${f.columnKey || "all"}`;
      if (f.source === "TABLE") return `TBL_REV|${f.tableId}|${f.columnKey}`;
      return `TRANS|${f.source || "default"}|${f.clientId || 0}`;
    }
    case "RETAINERS": return `RET|${f.clientId || 0}|${f.frequency || "all"}`;
    case "CUSTOMERS": return f.tableId ? `CUST_TBL|${f.tableId}` : "CUST";
    case "QUOTES": return `QUOTES|${f.status || "all"}|${f.clientId || 0}`;
    case "CALENDAR": return `CAL|${f.searchQuery || ""}`;
    case "RECORDS": return `REC|${f.tableId || 0}|${f.columnKey || ""}`;
    default: return `FALLBACK|${goal.id}`;
  }
}

/**
 * Batch-calculate metric values for all goals, then build GoalWithProgress objects.
 * Groups goals by query signature and pre-fetches shared data to minimize DB queries.
 * Uses a single global concurrency limit (5) across ALL goals to prevent connection pool saturation.
 */
async function enrichGoalsWithProgress(
  goals: any[],
  companyId: number,
): Promise<GoalWithProgress[]> {
  if (goals.length === 0) return [];

  // Step 1: Group goals by batch key
  const groups = new Map<string, any[]>();
  for (const goal of goals) {
    const key = goalBatchKey(goal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(goal);
  }

  const valueMap = new Map<number, number>();

  // Pre-pass: RETAINERS and TASKS-REDUCE groups share a single value (no date dependency).
  // Compute once per group and assign to all goals — avoids wasting concurrency slots.
  const individualGoals: any[] = [];
  const sharedGroupQueries: Array<{ groupGoals: any[]; first: any; filters: GoalFilters }> = [];

  for (const groupGoals of groups.values()) {
    const first = groupGoals[0];
    const filters = ((first as any).filters as GoalFilters) || {};
    const isShared =
      first.metricType === "RETAINERS" ||
      (first.metricType === "TASKS" && (filters.taskGoalMode || "COUNT") === "REDUCE");

    if (isShared) {
      sharedGroupQueries.push({ groupGoals, first, filters });
    } else {
      individualGoals.push(...groupGoals);
    }
  }

  // Process shared-value groups (one query each, very cheap)
  const CONCURRENCY_LIMIT = 5;
  for (let i = 0; i < sharedGroupQueries.length; i += CONCURRENCY_LIMIT) {
    await Promise.all(sharedGroupQueries.slice(i, i + CONCURRENCY_LIMIT).map(async ({ groupGoals, first, filters }) => {
      const tt = (first as any).targetType || "COUNT";
      const val = await calculateMetricValue(
        first.metricType, tt, companyId, first.startDate, first.endDate, filters,
      );
      for (const goal of groupGoals) valueMap.set(goal.id, val);
    }));
  }

  // Process all remaining goals with a single global concurrency limiter
  for (let i = 0; i < individualGoals.length; i += CONCURRENCY_LIMIT) {
    await Promise.all(individualGoals.slice(i, i + CONCURRENCY_LIMIT).map(async (goal) => {
      const f = ((goal as any).filters as GoalFilters) || {};
      const tt = (goal as any).targetType || "COUNT";
      const val = await calculateMetricValue(
        goal.metricType, tt, companyId, goal.startDate, goal.endDate, f,
      );
      valueMap.set(goal.id, val);
    }));
  }

  // Step 2: Build GoalWithProgress from pre-computed values
  return goals.map((goal) => {
    const filters = ((goal as any).filters as GoalFilters) || {};
    const targetType = (goal as any).targetType || "COUNT";
    const currentValue = valueMap.get(goal.id) ?? 0;
    const targetValue = Number(goal.targetValue);

    const isReduceMode =
      goal.metricType === "TASKS" && filters.taskGoalMode === "REDUCE";

    let progressPercent: number;
    if (isReduceMode) {
      if (currentValue <= targetValue) {
        progressPercent = 100;
      } else if (targetValue === 0) {
        const referenceBase = Math.max(currentValue, 10);
        progressPercent = Math.round(
          ((referenceBase - currentValue) / referenceBase) * 100,
        );
      } else {
        progressPercent = Math.max(
          0,
          Math.round((targetValue / currentValue) * 100),
        );
      }
    } else {
      progressPercent =
        targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0;
    }

    const now = new Date();
    const endDate = new Date(goal.endDate);
    const startDate = new Date(goal.startDate);
    const daysRemaining = Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const totalDays = Math.max(1, Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ));
    const daysElapsed = Math.max(
      1,
      Math.ceil(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const dailyRate = currentValue / daysElapsed;
    const projectedValue = Math.round(dailyRate * totalDays);

    let status: "ON_TRACK" | "WARNING" | "CRITICAL" | "EXCEEDED";
    if (progressPercent >= 100) status = "EXCEEDED";
    else if (progressPercent >= goal.warningThreshold) status = "ON_TRACK";
    else if (progressPercent >= goal.criticalThreshold) status = "WARNING";
    else status = "CRITICAL";

    const isMaintenanceGoal = goal.metricType === "RETAINERS";
    const finalProjected = isMaintenanceGoal ? currentValue : projectedValue;

    const recommendation = generateRecommendation(
      goal.metricType,
      progressPercent,
      targetType,
      daysRemaining,
      targetValue - currentValue,
    );

    return {
      id: goal.id,
      name: goal.name,
      metricType: goal.metricType,
      targetType: targetType,
      targetValue,
      currentValue,
      progressPercent,
      periodType: goal.periodType,
      startDate: goal.startDate,
      endDate: goal.endDate,
      filters,
      warningThreshold: goal.warningThreshold,
      criticalThreshold: goal.criticalThreshold,
      status,
      isActive: goal.isActive,
      isArchived: (goal as any).isArchived ?? false,
      notes: goal.notes,
      daysRemaining,
      projectedValue: finalProjected,
      recommendation,
    };
  });
}

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return getGoalsForCompany(user.companyId);
}

/**
 * Internal helper: get goals with progress for a company (no auth check).
 * Used by Inngest background jobs for cache pre-computation.
 * Reads from Redis cache first (30-min TTL, refreshed by Inngest on goal CRUD).
 */
export async function getGoalsForCompany(
  companyId: number,
  { skipCache = false }: { skipCache?: boolean } = {},
): Promise<GoalWithProgress[]> {
  // Try Redis cache first (populated by Inngest background job)
  // Returns stale data immediately and fires background refresh if stale
  if (!skipCache) {
    try {
      const { getCachedGoals } = await import("@/lib/services/dashboard-cache");
      const cached = await getCachedGoals(companyId);
      if (cached) {
        if (cached.stale) {
          // Fire non-blocking background refresh (Inngest deduplicates via 10s debounce + 1/company concurrency)
          inngest.send({
            id: `goals-refresh-${companyId}-${Math.floor(Date.now() / 10000)}`,
            name: "dashboard/refresh-goals",
            data: { companyId },
          }).catch((e) => console.error("[Goals] Stale refresh trigger failed:", e));
        }
        return cached.data as GoalWithProgress[];
      }
    } catch {
      // Redis down — fall through to live computation
    }
  }

  const where: any = { companyId, isArchived: false };

  const goals = await withRetry(() => prisma.goal.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 200,
  }));

  const result = await enrichGoalsWithProgress(goals, companyId);

  // Cache is populated exclusively by the Inngest background job (dashboard/refresh-goals).
  // Writing here would race with Inngest and overwrite fresh data with stale results.

  return result;
}

export async function getArchivedGoals(): Promise<GoalWithProgress[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const goals = await withRetry(() => prisma.goal.findMany({
    where: { companyId: user.companyId, isArchived: true },
    orderBy: [{ endDate: "desc" }],
    take: 200,
  }));

  // Serve from stored snapshot — ZERO metric queries for archived goals
  // Legacy goals without snapshots fall back to live computation (temporary path)
  const goalsWithSnapshot: GoalWithProgress[] = [];
  const goalsWithoutSnapshot: any[] = [];

  for (const goal of goals) {
    const filters = ((goal as any).filters as GoalFilters) || {};
    const snapshot = (filters as any)._archivedSnapshot;

    if (snapshot) {
      const targetType = (goal as any).targetType || "COUNT";
      const targetValue = Number(goal.targetValue);
      const currentValue = snapshot.currentValue ?? 0;
      const progressPercent = snapshot.progressPercent ?? (targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0);

      const endDate = new Date(goal.endDate);
      const startDate = new Date(goal.startDate);
      const now = new Date();
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

      goalsWithSnapshot.push({
        id: goal.id,
        name: goal.name,
        metricType: goal.metricType,
        targetType,
        targetValue,
        currentValue,
        progressPercent,
        periodType: goal.periodType,
        startDate: goal.startDate,
        endDate: goal.endDate,
        filters,
        warningThreshold: goal.warningThreshold,
        criticalThreshold: goal.criticalThreshold,
        status: snapshot.status ?? (progressPercent >= 100 ? "EXCEEDED" : progressPercent >= goal.warningThreshold ? "ON_TRACK" : progressPercent >= goal.criticalThreshold ? "WARNING" : "CRITICAL"),
        isActive: goal.isActive,
        isArchived: true,
        notes: goal.notes,
        daysRemaining,
        projectedValue: snapshot.projectedValue ?? Math.round((currentValue / daysElapsed) * totalDays),
        recommendation: snapshot.recommendation ?? null,
      });
    } else {
      goalsWithoutSnapshot.push(goal);
    }
  }

  // Live-compute legacy archived goals that were archived before snapshots existed.
  // Persist snapshots back so subsequent loads are free (one-time write-back).
  if (goalsWithoutSnapshot.length > 0) {
    const liveResults = await enrichGoalsWithProgress(goalsWithoutSnapshot, user.companyId);
    const snapshotPromises: Promise<void>[] = [];

    for (let i = 0; i < liveResults.length; i++) {
      const r = liveResults[i];
      r.isArchived = true;
      goalsWithSnapshot.push(r);

      // Persist snapshot with retry (2 attempts) so this goal never triggers live computation again
      const legacyGoal = goalsWithoutSnapshot[i];
      const existingFilters = ((legacyGoal as any).filters as any) || {};
      const snapshotData = {
        currentValue: r.currentValue,
        progressPercent: r.progressPercent,
        status: r.status,
        projectedValue: r.projectedValue,
        daysRemaining: r.daysRemaining,
        recommendation: r.recommendation,
        archivedAt: new Date().toISOString(),
      };
      const persistSnapshot = async () => {
        try {
          await withRetry(() => prisma.goal.update({
            where: { id: legacyGoal.id, companyId: user.companyId },
            data: {
              filters: { ...existingFilters, _archivedSnapshot: snapshotData },
            },
          }));
        } catch (e) {
          console.error(
            `[Goals] Failed to persist snapshot for goal ${legacyGoal.id}:`,
            e,
          );
        }
      };
      snapshotPromises.push(persistSnapshot());
    }

    await Promise.allSettled(snapshotPromises);
  }

  return goalsWithSnapshot;
}

export async function updateGoalOrder(goalIds: number[]) {
  if (!Array.isArray(goalIds) || goalIds.length === 0) return;
  if (goalIds.length > 200) throw new Error("Too many goals");
  if (!goalIds.every((id) => Number.isInteger(id) && id > 0)) throw new Error("Invalid goal ids");

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Single SQL statement instead of N individual updates
  await withRetry(() => prisma.$executeRaw`
    UPDATE "Goal" AS g
    SET "order" = v.new_order, "updatedAt" = NOW()
    FROM (
      SELECT unnest(${goalIds}::int[]) AS id,
             generate_series(0, ${goalIds.length - 1}) AS new_order
    ) AS v
    WHERE g.id = v.id AND g."companyId" = ${user.companyId}
  `);

  // Invalidate goals cache so dashboard reflects the new order (fire-and-forget)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => console.error("[Goals] Failed to send dashboard refresh:", e));

  revalidatePath("/finance/goals");
}

export async function getGoalCreationData() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const [clients, tables] = await Promise.all([
    withRetry(() => prisma.client.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    })),
    withRetry(() => prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        name: true,
        schemaJson: true,
      },
      take: 100,
    })),
  ]);

  const formattedTables = tables.map((table) => {
    let columns: any[] = [];
    try {
      let rawColumns: any[] = [];
      const schema = table.schemaJson as any;

      if (Array.isArray(schema)) {
        rawColumns = schema;
      } else if (schema && typeof schema === "object") {
        if (Array.isArray(schema.columns)) {
          rawColumns = schema.columns;
        } else if (Array.isArray(schema.fields)) {
          rawColumns = schema.fields;
        }
      }

      columns = rawColumns.map((c: any) => ({
        id: c.id || c.name,
        key: c.key || c.name || c.id,
        name: c.label || c.displayName || c.name,
        type: c.type,
      }));
    } catch (e) {
      console.error("Failed to parse table schema", table.id);
    }
    return {
      id: table.id,
      name: table.name,
      columns,
    };
  });

  return { clients, tables: formattedTables };
}
