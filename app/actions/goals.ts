"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

// Use Prisma.Decimal instead of importing Decimal directly
type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

export type MetricType =
  | "REVENUE" // Total income (Paid transactions OR Table Sum OR Finance Record)
  | "SALES" // Number of sales
  | "LEADS" // New clients/leads
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
  tableId?: number; // For leads OR revenue from specific table
  source?: string; // 'TRANSACTIONS' | 'TABLE' | 'FINANCE_RECORD'
  columnKey?: string; // If source=TABLE, which column to sum. If source=FINANCE_RECORD, acts as category filter
  searchQuery?: string; // For calendar events or general text search
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
  filters: GoalFilters
) {
  const user = await getCurrentUser();
  if (!user) return 0;

  return await calculateMetricValue(
    metricType,
    targetType,
    user.companyId,
    startDate,
    endDate,
    filters
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
      targetValue: new Decimal(data.targetValue),
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
  return goal;
}

// Archive/Restore Goal
export async function toggleGoalArchive(id: number, isArchived: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.goal.update({
    where: { id, companyId: user.companyId },
    data: { isArchived },
  });

  revalidatePath("/finance/goals");
  revalidatePath("/finance/goals/archive");
}

// Utility to build dynamic where clause based on time period
function getDateFilter(
  startDate: Date,
  endDate: Date,
  field: string = "createdAt"
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
  startDate: Date,
  endDate: Date,
  filters: GoalFilters
): Promise<number> {
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

        const records = await prisma.record.findMany({
          where,
          select: { data: true },
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

      // Option C: Revenue from Transactions (Legacy System Financials)
      const where: any = {
        client: { companyId },
        status: {
          in: ["manual-marked-paid", "paid", "PAID", "completed", "COMPLETED"],
        },
        ...clientFilter,
        paidDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (targetType?.toUpperCase() === "SUM" || metricType === "REVENUE") {
        const result = await prisma.transaction.aggregate({
          where,
          _sum: { amount: true },
        });
        return Number(result._sum.amount ?? 0);
      } else {
        return await prisma.transaction.count({ where });
      }
    }

    case "LEADS": {
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
      const where: any = {
        companyId,
        status: filters.status || {
          in: ["done", "Done", "completed", "Completed"],
        },
        ...getDateFilter(startDate, endDate, "updatedAt"),
      };

      return await prisma.task.count({ where });
    }

    case "QUOTES": {
      const where: any = {
        companyId,
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
  gap: number
): string | null {
  if (gap <= 0) return "🎉 יעד הושג! כל הכבוד.";
  if (daysRemaining <= 0) return "⌛ הזמן עבר.";

  const dailyPace = gap / daysRemaining;
  const unit = targetType?.toUpperCase() === "SUM" ? "₪" : "יח׳";

  if (progress >= 80) return "🚀 ממש בקרוב, המשך כך!";

  if (metricType === "RETAINERS") {
    return `💡 כדי להגיע ליעד, צריך להוסיף עוד ${Math.ceil(
      gap
    ).toLocaleString()} ${unit} לריטיינר החודשי.`;
  }

  return `👉 נדרש קצב של ${Math.ceil(
    dailyPace
  ).toLocaleString()} ${unit} ליום כדי לעמוד ביעד.`;
}

// Internal helper to calculate progress for a list of goals
async function enrichGoalsWithProgress(
  goals: any[],
  companyId: number
): Promise<GoalWithProgress[]> {
  return Promise.all(
    goals.map(async (goal) => {
      const filters = ((goal as any).filters as GoalFilters) || {};
      const targetType = (goal as any).targetType || "COUNT";

      const currentValue = await calculateMetricValue(
        goal.metricType,
        targetType,
        companyId,
        goal.startDate,
        goal.endDate,
        filters
      );

      const targetValue = Number(goal.targetValue);
      const progressPercent =
        targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0;

      const now = new Date();
      const endDate = new Date(goal.endDate);
      const startDate = new Date(goal.startDate);
      const daysRemaining = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysElapsed = Math.max(
        1,
        Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
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
        targetValue - currentValue
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
    })
  );
}

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Type cast for 'isArchived' because it might not be in generated types yet
  const where: any = { companyId: user.companyId, isArchived: false };

  const goals = await prisma.goal.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  return enrichGoalsWithProgress(goals, user.companyId);
}

export async function getArchivedGoals(): Promise<GoalWithProgress[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Type cast for 'isArchived'
  const where: any = { companyId: user.companyId, isArchived: true };

  const goals = await prisma.goal.findMany({
    where,
    orderBy: [{ endDate: "desc" }],
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
    })
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
      select: { id: true, name: true, company: true },
    }),
    prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        name: true,
        schemaJson: true,
      },
    }),
  ]);

  const formattedTables = tables.map((table) => {
    let columns: any[] = [];
    try {
      const schema = table.schemaJson as any;
      if (schema && Array.isArray(schema.columns)) {
        columns = schema.columns.map((c: any) => ({
          id: c.id,
          key: c.key || c.id,
          name: c.name,
          type: c.type,
        }));
      }
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
