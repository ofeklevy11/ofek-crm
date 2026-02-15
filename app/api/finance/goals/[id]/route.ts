import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";

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
  filters: z.record(z.unknown()).optional(),
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

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

    const goal = await withRetry(() => prisma.goal.findUnique({
      where: { id: goalId, companyId: user.companyId },
    }));

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Failed to fetch goal:", error);
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

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

    const raw = await request.json();
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

    // SECURITY: Validate tableId and productId belong to user's company
    if (body.tableId !== undefined && body.tableId !== null) {
      const table = await withRetry(() => prisma.tableMeta.findFirst({
        where: { id: body.tableId, companyId: user.companyId },
        select: { id: true },
      }));
      if (!table) {
        return NextResponse.json({ error: "Invalid tableId" }, { status: 400 });
      }
    }
    if (body.productId !== undefined && body.productId !== null) {
      const product = await withRetry(() => prisma.product.findFirst({
        where: { id: body.productId, companyId: user.companyId },
        select: { id: true },
      }));
      if (!product) {
        return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
      }
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
        ...(body.tableId !== undefined && { tableId: body.tableId }),
        ...(body.productId !== undefined && { productId: body.productId }),
        ...(body.warningThreshold !== undefined && {
          warningThreshold: body.warningThreshold,
        }),
        ...(body.criticalThreshold !== undefined && {
          criticalThreshold: body.criticalThreshold,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
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
      console.error("[Goals API] Failed to send dashboard refresh:", e);
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

    const { id } = await params;
    const goalId = parseGoalId(id);
    if (goalId === null) {
      return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
    }

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
      console.error("[Goals API] Failed to send dashboard refresh:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "goal");
  }
}
