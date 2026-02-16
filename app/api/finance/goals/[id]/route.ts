import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { goalFiltersSchema, MAX_GOAL_PAYLOAD_BYTES } from "@/lib/validations/goal";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceGoalAPI");

const Decimal = Prisma.Decimal;

const VALID_METRIC_TYPES = ["REVENUE", "SALES", "CUSTOMERS", "TASKS", "RETAINERS", "QUOTES", "CALENDAR", "RECORDS"] as const;

const updateGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  metricType: z.enum(VALID_METRIC_TYPES).optional(),
  targetType: z.enum(["COUNT", "SUM"]).optional(),
  targetValue: z.number().positive().optional(),
  periodType: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  filters: goalFiltersSchema.optional(),
  tableId: z.number().int().positive().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  warningThreshold: z.number().int().min(0).max(100).optional(),
  criticalThreshold: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (d) => !(d.startDate && d.endDate) || new Date(d.endDate) >= new Date(d.startDate),
  { message: "endDate must be >= startDate", path: ["endDate"] },
).refine(
  (d) => !(d.warningThreshold !== undefined && d.criticalThreshold !== undefined) || d.warningThreshold >= d.criticalThreshold,
  { message: "warningThreshold must be >= criticalThreshold", path: ["warningThreshold"] },
);

function parseGoalId(id: string): number | null {
  const parsed = parseInt(id, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canViewGoals")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.goalRead);
    if (limited) return limited;

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

    const goal = await withRetry(() => prisma.goal.findUnique({
      where: { id: goalId, companyId: user.companyId },
      select: {
        id: true, name: true, metricType: true, targetType: true, targetValue: true,
        periodType: true, startDate: true, endDate: true, filters: true,
        warningThreshold: true, criticalThreshold: true,
        isActive: true, isArchived: true, order: true, notes: true,
        createdAt: true, updatedAt: true,
      },
    }));

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    log.error("Failed to fetch goal", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch goal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canViewGoals")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.goalMutation);
    if (limited) return limited;

    // Payload size check
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_GOAL_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateGoalSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Cross-field validation: fetch existing goal to merge with partial update
    const existingGoal = await withRetry(() => prisma.goal.findUnique({
      where: { id: goalId, companyId: user.companyId },
      select: { startDate: true, endDate: true, warningThreshold: true, criticalThreshold: true },
    }));
    if (!existingGoal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const mergedStart = body.startDate ? new Date(body.startDate) : existingGoal.startDate;
    const mergedEnd = body.endDate ? new Date(body.endDate) : existingGoal.endDate;
    if (mergedEnd < mergedStart) {
      return NextResponse.json(
        { error: "Validation failed", details: { endDate: ["endDate must be >= startDate"] } },
        { status: 400 },
      );
    }
    const mergedWarning = body.warningThreshold ?? existingGoal.warningThreshold;
    const mergedCritical = body.criticalThreshold ?? existingGoal.criticalThreshold;
    if (mergedWarning < mergedCritical) {
      return NextResponse.json(
        { error: "Validation failed", details: { warningThreshold: ["warningThreshold must be >= criticalThreshold"] } },
        { status: 400 },
      );
    }

    const goal = await withRetry(() => prisma.goal.update({
      where: { id: goalId, companyId: user.companyId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.metricType !== undefined && { metricType: body.metricType }),
        ...(body.targetValue !== undefined && {
          targetValue: new Decimal(body.targetValue),
        }),
        ...(body.targetType !== undefined && { targetType: body.targetType }),
        ...(body.filters !== undefined && { filters: body.filters }),
        ...(body.periodType !== undefined && { periodType: body.periodType }),
        ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
        ...(body.endDate !== undefined && { endDate: new Date(body.endDate) }),
        ...(body.warningThreshold !== undefined && {
          warningThreshold: body.warningThreshold,
        }),
        ...(body.criticalThreshold !== undefined && {
          criticalThreshold: body.criticalThreshold,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      select: {
        id: true, name: true, metricType: true, targetType: true, targetValue: true,
        periodType: true, startDate: true, endDate: true, filters: true,
        warningThreshold: true, criticalThreshold: true,
        isActive: true, isArchived: true, order: true, notes: true,
        createdAt: true, updatedAt: true,
      },
    }));

    // Invalidate goals cache so dashboard reflects the update
    try {
      await inngest.send({
        id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-goals",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      log.error("Failed to send dashboard refresh", { error: String(e) });
    }

    return NextResponse.json(goal);
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "goal");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canViewGoals")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.goalMutation);
    if (limited) return limited;

    // Soft-delete: archive and deactivate instead of permanent removal
    await withRetry(() => prisma.goal.update({
      where: { id: goalId, companyId: user.companyId },
      data: { isArchived: true, isActive: false },
    }));

    // Invalidate goals cache so dashboard no longer shows the deleted goal
    try {
      await inngest.send({
        id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-goals",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      log.error("Failed to send dashboard refresh", { error: String(e) });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "goal");
  }
}
