"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
// import { Prisma } from "@prisma/client";
// Use number for Decimal fields
// type Decimal = Prisma.Decimal;
// const Decimal = Prisma.Decimal;
import { startOfDay, endOfDay } from "date-fns";
import { inngest } from "@/lib/inngest/client";

export type MetricType =
  | "REVENUE" // Total income (Paid transactions OR Table Sum OR Finance Record)
  | "SALES" // Number of sales
  | "CUSTOMERS" // Customers from finance page (Client model)
  | "TASKS" // Tasks completion
  | "RETAINERS" // Retainers analysis
  | "QUOTES" // Quotes analysis
  | "CALENDAR" // Calendar events
  | "RECORDS"; // Generic table records

export type TargetType = "COUNT" | "SUM";

export type PeriodType = "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

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

// Helper for live preview in the UI - exposed to client
export async function previewGoalValue(
  metricType: MetricType,
  targetType: TargetType,
  periodType: PeriodType,
  startDate: Date,
  endDate: Date,
  filters: GoalFilters,
) {
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

  const goal = await prisma.goal.create({
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
  });

  revalidatePath("/finance/goals");

  // Trigger dashboard goals cache refresh
  try {
    await inngest.send({
      id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-goals",
      data: { companyId: user.companyId },
    });
  } catch (e) {
    console.error("[Goals] Failed to send dashboard refresh:", e);
  }

  return { ...goal, targetValue: Number(goal.targetValue) };
}

// Archive/Restore Goal
export async function toggleGoalArchive(id: number, isArchived: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.goal.update({
    where: { id, companyId: user.companyId },
    data: { isArchived },
  });

  // Trigger dashboard goals cache refresh
  try {
    await inngest.send({
      id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-goals",
      data: { companyId: user.companyId },
    });
  } catch (e) {
    console.error("[Goals] Failed to send dashboard refresh:", e);
  }

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
        client: { companyId },
        status: { in: ["active", "Active", "ACTIVE"] },
        ...clientFilter,
      };

      if (filters.frequency && filters.frequency !== "all") {
        where.frequency = filters.frequency;
      }

      if (targetType?.toUpperCase() === "SUM") {
        const result = await prisma.retainer.aggregate({
          where,
          _sum: { amount: true },
        });
        return Number(result._sum.amount ?? 0);
      } else {
        return await prisma.retainer.count({ where });
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
          const result = await prisma.financeRecord.aggregate({
            where,
            _sum: { amount: true },
          });
          return Number(result._sum.amount ?? 0);
        } else {
          return await prisma.financeRecord.count({ where });
        }
      }

      // Option B: Revenue from Specific Table (e.g. "Deals")
      if (filters.source === "TABLE" && filters.tableId && filters.columnKey) {
        const where: any = {
          companyId,
          tableId: filters.tableId,
          ...getDateFilter(startDate, endDate, "createdAt"),
        };

        // P121: Add take limit to record queries used for metric calculation
        const records = await prisma.record.findMany({
          where,
          select: { data: true },
          take: 5000, // P211: Lowered from 10000 to cap memory for metric calculations
        });

        if (targetType?.toUpperCase() === "SUM") {
          const sum = records.reduce((acc, r: any) => {
            const val = r.data?.[filters.columnKey!] || 0;
            const num =
              typeof val === "string"
                ? parseFloat(val.replace(/[^0-9.-]+/g, ""))
                : Number(val);
            return acc + (isNaN(num) ? 0 : num);
          }, 0);
          return sum;
        } else {
          return records.length;
        }
      }

      // Option C: Revenue from Payments System (Transactions + OneTimePayments)
      // We sum up both sources to ensure coverage of both legacy and new systems.

      // 1. Transactions (Legacy)
      const transactionWhere: any = {
        client: { companyId },
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
        client: { companyId },
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
        prisma.transaction.aggregate({
          where: transactionWhere,
          _sum: { amount: true },
        }),
        prisma.transaction.count({ where: transactionWhere }),
        prisma.oneTimePayment.aggregate({
          where: paymentWhere,
          _sum: { amount: true },
        }),
        prisma.oneTimePayment.count({ where: paymentWhere }),
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
        return await prisma.record.count({ where });
      }

      const where: any = {
        companyId,
        ...getDateFilter(startDate, endDate, "createdAt"),
      };
      return await prisma.client.count({ where });
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

        return await prisma.task.count({ where });
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

      return await prisma.task.count({ where });
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
        const result = await prisma.quote.aggregate({
          where,
          _sum: { total: true },
        });
        return Number(result._sum.total ?? 0);
      } else {
        return await prisma.quote.count({ where });
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

      return await prisma.calendarEvent.count({ where });
    }

    case "RECORDS": {
      if (!filters.tableId) return 0;

      const where: any = {
        companyId,
        tableId: filters.tableId,
        ...getDateFilter(startDate, endDate, "createdAt"),
      };

      if (targetType?.toUpperCase() === "SUM" && filters.columnKey) {
        // P121: Add take limit to record queries for metric sum calculation
        const records = await prisma.record.findMany({
          where,
          select: { data: true },
          take: 5000, // P211: Lowered from 10000 to cap memory for metric calculations
        });

        const sum = records.reduce((acc, r: any) => {
          const val = r.data?.[filters.columnKey!] || 0;
          const num =
            typeof val === "string"
              ? parseFloat(val.replace(/[^0-9.-]+/g, ""))
              : Number(val);
          return acc + (isNaN(num) ? 0 : num);
        }, 0);
        return sum;
      }

      return await prisma.record.count({ where });
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

// Internal helper to calculate progress for a list of goals.
// Processes in chunks of 15 to avoid exhausting DB connection pool.
async function enrichGoalsWithProgress(
  goals: any[],
  companyId: number,
): Promise<GoalWithProgress[]> {
  const CHUNK_SIZE = 15;
  const results: GoalWithProgress[] = [];
  for (let i = 0; i < goals.length; i += CHUNK_SIZE) {
    const chunk = goals.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (goal) => {
      const filters = ((goal as any).filters as GoalFilters) || {};
      const targetType = (goal as any).targetType || "COUNT";

      const currentValue = await calculateMetricValue(
        goal.metricType,
        targetType,
        companyId,
        goal.startDate,
        goal.endDate,
        filters,
      );

      const targetValue = Number(goal.targetValue);

      // For REDUCE mode (tasks), progress is inverted:
      // If target is 2 and current is 10, we're far from goal (low progress)
      // If target is 2 and current is 3, we're close to goal (high progress)
      const isReduceMode =
        goal.metricType === "TASKS" && filters.taskGoalMode === "REDUCE";

      let progressPercent: number;
      if (isReduceMode) {
        // In reduce mode, lower currentValue = better progress
        // If current <= target, we've achieved the goal (100%+)
        if (currentValue <= targetValue) {
          progressPercent = 100;
        } else if (targetValue === 0) {
          // Special case: target is 0, we want to eliminate all tasks
          // Use a reference scale: assume starting from max(currentValue, 10) tasks
          // This way, fewer tasks = higher progress
          // Example: 4 tasks with target 0, using base 10: progress = (10-4)/10 = 60%
          // Example: 2 tasks with target 0: progress = (10-2)/10 = 80%
          // Example: 0 tasks with target 0: progress = 100%
          const referenceBase = Math.max(currentValue, 10);
          progressPercent = Math.round(
            ((referenceBase - currentValue) / referenceBase) * 100,
          );
        } else {
          // Progress based on how close current is to target
          // The closer currentValue is to targetValue, the higher the progress
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
      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
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
      }),
    );
    results.push(...chunkResults);
  }
  return results;
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
 */
export async function getGoalsForCompany(companyId: number): Promise<GoalWithProgress[]> {
  // Type cast for 'isArchived' because it might not be in generated types yet
  const where: any = { companyId, isArchived: false };

  // P120: Add take limit to bound goal queries
  const goals = await prisma.goal.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return enrichGoalsWithProgress(goals, companyId);
}

export async function getArchivedGoals(): Promise<GoalWithProgress[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const where: any = { companyId: user.companyId, isArchived: true };

  // P120: Add take limit to bound archived goal queries
  const goals = await prisma.goal.findMany({
    where,
    orderBy: [{ endDate: "desc" }],
    take: 200,
  });

  return enrichGoalsWithProgress(goals, user.companyId);
}

export async function updateGoalOrder(goalIds: number[]) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Use a transaction to update all goals
  const updates = goalIds.map((id, index) =>
    prisma.goal.update({
      where: { id, companyId: user.companyId },
      data: { order: index },
    }),
  );

  await prisma.$transaction(updates);
  revalidatePath("/finance/goals");
}

export async function getGoalCreationData() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const [clients, tables] = await Promise.all([
    prisma.client.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
      take: 5000, // P211+P216: Lowered from 10000, removed unnecessary company join
    }),
    prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        name: true,
        schemaJson: true,
      },
      take: 500,
    }),
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
