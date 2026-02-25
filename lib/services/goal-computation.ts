import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/db-retry";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { GOALS_DEDUP_WINDOW_MS } from "@/lib/constants/dedup";
import { startOfDay, endOfDay } from "date-fns";
import type { GoalFilters, GoalWithProgress } from "@/lib/validations/goal";

const log = createLogger("GoalComputation");

/**
 * Internal helper: fetch goal creation data (clients + tables) for a company.
 * NOT a server action — safe to call from server components without auth bypass risk.
 */
export async function getGoalCreationDataInternal(companyId: number) {
  const [clients, tables] = await Promise.all([
    withRetry(() => prisma.client.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    })),
    withRetry(() => prisma.tableMeta.findMany({
      where: { companyId },
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
      log.error("Failed to parse table schema", { tableId: table.id });
    }
    return {
      id: table.id,
      name: table.name,
      columns,
    };
  });

  return { clients, tables: formattedTables };
}

// Validates field names used in raw SQL JSON accessors — prevents data probing via arbitrary keys
const SAFE_FIELD_NAME = /^[a-zA-Z0-9_\u0590-\u05FF]+$/;

const VALID_METRIC_TYPES = new Set<string>(["REVENUE", "SALES", "CUSTOMERS", "TASKS", "RETAINERS", "QUOTES", "CALENDAR", "RECORDS"]);
const VALID_TARGET_TYPES = new Set<string>(["COUNT", "SUM"]);
const VALID_PERIOD_TYPES = new Set<string>(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]);

export { VALID_METRIC_TYPES, VALID_TARGET_TYPES, VALID_PERIOD_TYPES };

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

export async function calculateMetricValue(
  metricType: string,
  targetType: string,
  companyId: number,
  startDateRaw: Date,
  endDateRaw: Date,
  filters: GoalFilters,
): Promise<number> {
  const startDate = startOfDay(startDateRaw);
  const endDate = endOfDay(endDateRaw);

  const clientFilter = filters.clientId ? { clientId: filters.clientId } : {};

  switch (metricType) {
    case "RETAINERS": {
      const where: any = {
        companyId,
        status: "active",
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
      if (filters.source === "FINANCE_RECORD") {
        const type = "INCOME";

        const where: any = {
          companyId,
          type,
          ...getDateFilter(startDate, endDate, "date"),
        };

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

      if (filters.source === "TABLE" && filters.tableId && filters.columnKey) {
        if (!SAFE_FIELD_NAME.test(filters.columnKey)) return 0;

        if (targetType?.toUpperCase() === "SUM") {
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

      const transactionWhere: any = {
        companyId,
        status: "paid",
        ...clientFilter,
        OR: [
          { paidDate: { gte: startDate, lte: endDate } },
          {
            paidDate: null,
            updatedAt: { gte: startDate, lte: endDate },
          },
        ],
      };

      const paymentWhere: any = {
        companyId,
        status: "paid",
        ...clientFilter,
        OR: [
          { paidDate: { gte: startDate, lte: endDate } },
          {
            paidDate: null,
            dueDate: { gte: startDate, lte: endDate },
          },
          {
            paidDate: null,
            updatedAt: { gte: startDate, lte: endDate },
          },
        ],
      };

      if (filters.source === "TRANSACTIONS_RETAINER") {
        transactionWhere.relatedType = "retainer";

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
        transactionWhere.relatedType = { not: "retainer" };

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

      const needsSum = targetType?.toUpperCase() === "SUM" || metricType === "REVENUE";

      if (needsSum) {
        const [transSum, paySum] = await Promise.all([
          withRetry(() => prisma.transaction.aggregate({
            where: transactionWhere,
            _sum: { amount: true },
          })),
          withRetry(() => prisma.oneTimePayment.aggregate({
            where: paymentWhere,
            _sum: { amount: true },
          })),
        ]);
        return Number(transSum._sum.amount ?? 0) + Number(paySum._sum.amount ?? 0);
      } else {
        const [transCount, payCount] = await Promise.all([
          withRetry(() => prisma.transaction.count({ where: transactionWhere })),
          withRetry(() => prisma.oneTimePayment.count({ where: paymentWhere })),
        ]);
        return transCount + payCount;
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
      const statusMap: Record<string, string[]> = {
        TODO: ["todo"],
        IN_PROGRESS: ["in_progress"],
        WAITING_CLIENT: ["waiting_client"],
        ON_HOLD: ["on_hold"],
        COMPLETED: ["completed_month", "done"],
      };

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
        const safeQuery = filters.searchQuery.slice(0, 200);
        where.OR = [
          { title: { contains: safeQuery, mode: "insensitive" } },
          {
            description: { contains: safeQuery, mode: "insensitive" },
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
        if (!SAFE_FIELD_NAME.test(filters.columnKey)) return 0;

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
    case "RETAINERS": return `RET|${f.clientId || 0}|${f.frequency || "all"}|${(goal as any).targetType || "COUNT"}`;
    case "CUSTOMERS": return f.tableId ? `CUST_TBL|${f.tableId}` : "CUST";
    case "QUOTES": return `QUOTES|${f.status || "all"}|${f.clientId || 0}`;
    case "CALENDAR": return `CAL|${f.searchQuery || ""}`;
    case "RECORDS": return `REC|${f.tableId || 0}|${f.columnKey || ""}`;
    default: return `FALLBACK|${goal.id}`;
  }
}

/**
 * Batch-calculate metric values for all goals, then build GoalWithProgress objects.
 */
export async function enrichGoalsWithProgress(
  goals: any[],
  companyId: number,
): Promise<GoalWithProgress[]> {
  if (goals.length === 0) return [];

  const groups = new Map<string, any[]>();
  for (const goal of goals) {
    const key = goalBatchKey(goal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(goal);
  }

  const valueMap = new Map<number, number>();

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

  // S4: Run both shared-group and individual goal queries concurrently
  const CONCURRENCY_LIMIT = 5;

  const runChunked = async (items: any[], handler: (item: any) => Promise<void>) => {
    for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
      await Promise.all(items.slice(i, i + CONCURRENCY_LIMIT).map(handler));
    }
  };

  await Promise.all([
    runChunked(sharedGroupQueries, async ({ groupGoals, first, filters }) => {
      const tt = (first as any).targetType || "COUNT";
      const val = await calculateMetricValue(
        first.metricType, tt, companyId, first.startDate, first.endDate, filters,
      );
      for (const goal of groupGoals) valueMap.set(goal.id, val);
    }),
    runChunked(individualGoals, async (goal) => {
      const f = ((goal as any).filters as GoalFilters) || {};
      const tt = (goal as any).targetType || "COUNT";
      const val = await calculateMetricValue(
        goal.metricType, tt, companyId, goal.startDate, goal.endDate, f,
      );
      valueMap.set(goal.id, val);
    }),
  ]);

  const now = new Date();

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

/**
 * Internal helper: get goals with progress for a company (no auth check).
 * Used by Inngest background jobs and pre-authenticated server actions.
 */
export async function getGoalsForCompanyInternal(
  companyId: number,
  { skipCache = false }: { skipCache?: boolean } = {},
): Promise<GoalWithProgress[]> {
  if (!skipCache) {
    try {
      const { getCachedGoals } = await import("@/lib/services/dashboard-cache");
      const cached = await getCachedGoals(companyId);
      if (cached) {
        if (cached.stale) {
          inngest.send({
            id: `goals-refresh-${companyId}-${Math.floor(Date.now() / GOALS_DEDUP_WINDOW_MS)}`,
            name: "dashboard/refresh-goals",
            data: { companyId },
          }).catch((e) => log.error("Stale refresh trigger failed", { error: String(e) }));
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
    select: {
      id: true, name: true, metricType: true, targetValue: true,
      targetType: true, periodType: true, startDate: true, endDate: true,
      warningThreshold: true, criticalThreshold: true, notes: true,
      isActive: true, isArchived: true, filters: true,
      order: true, createdAt: true, updatedAt: true,
    },
  }));

  const result = await enrichGoalsWithProgress(goals, companyId);

  return result;
}
