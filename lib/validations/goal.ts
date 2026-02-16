import { z } from "zod";
import type { GoalMetricType, GoalTargetType, GoalPeriodType } from "@prisma/client";

export const goalFiltersSchema = z.object({
  clientId: z.number().int().positive().optional(),
  frequency: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  tableId: z.number().int().positive().optional(),
  source: z.enum(["TRANSACTIONS", "TABLE", "FINANCE_RECORD", "TRANSACTIONS_RETAINER", "TRANSACTIONS_ONE_TIME"]).optional(),
  columnKey: z.string().max(100).regex(/^[a-zA-Z0-9_\u0590-\u05FF]+$/).optional(),
  searchQuery: z.string().max(200).optional(),
  taskGoalMode: z.enum(["COUNT", "REDUCE"]).optional(),
}).strict();

export const MAX_GOALS_PER_COMPANY = 50;
export const MAX_GOAL_PAYLOAD_BYTES = 102_400; // 100 KB

// --- Interfaces (single source of truth) ---

export interface GoalFilters {
  clientId?: number;
  frequency?: string;
  status?: string;
  tableId?: number;
  source?: string;
  columnKey?: string;
  searchQuery?: string;
  taskGoalMode?: "COUNT" | "REDUCE";
}

export interface GoalFormData {
  name: string;
  metricType: GoalMetricType;
  targetType: GoalTargetType;
  targetValue: number;
  periodType: GoalPeriodType;
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

// --- Zod schema for createGoal server action ---

export const goalFormDataSchema = z.object({
  name: z.string().min(1).max(200),
  metricType: z.enum(["REVENUE", "SALES", "CUSTOMERS", "TASKS", "RETAINERS", "QUOTES", "CALENDAR", "RECORDS"]),
  targetType: z.enum(["COUNT", "SUM"]),
  targetValue: z.number().min(0),
  periodType: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  filters: goalFiltersSchema.default({}),
  warningThreshold: z.number().int().min(0).max(100).default(70),
  criticalThreshold: z.number().int().min(0).max(100).default(50),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (d) => d.endDate >= d.startDate,
  { message: "endDate must be >= startDate", path: ["endDate"] },
).refine(
  (d) => d.warningThreshold >= d.criticalThreshold,
  { message: "warningThreshold must be >= criticalThreshold", path: ["warningThreshold"] },
);
