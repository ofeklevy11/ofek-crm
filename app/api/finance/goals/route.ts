import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";

const Decimal = Prisma.Decimal;

const VALID_METRIC_TYPES = ["REVENUE", "SALES", "CUSTOMERS", "TASKS", "RETAINERS", "QUOTES", "CALENDAR", "RECORDS"] as const;

const createGoalSchema = z.object({
  name: z.string().min(1).max(200),
  metricType: z.enum(VALID_METRIC_TYPES),
  targetType: z.enum(["COUNT", "SUM"]).default("SUM"),
  targetValue: z.number().positive(),
  periodType: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).default("MONTHLY"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  filters: z.record(z.unknown()).default({}),
  tableId: z.number().int().positive().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  warningThreshold: z.number().int().min(0).max(100).default(70),
  criticalThreshold: z.number().int().min(0).max(100).default(50),
  notes: z.string().max(2000).nullable().optional(),
}).refine(
  (d) => new Date(d.endDate) >= new Date(d.startDate),
  { message: "endDate must be >= startDate", path: ["endDate"] },
).refine(
  (d) => d.warningThreshold >= d.criticalThreshold,
  { message: "warningThreshold must be >= criticalThreshold", path: ["warningThreshold"] },
);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await withRetry(() => prisma.goal.findMany({
      where: { companyId: user.companyId, isArchived: false },
      orderBy: [{ order: "asc" }, { endDate: "asc" }],
      take: 200,
    }));

    return NextResponse.json(goals);
  } catch (error) {
    console.error("Failed to fetch goals:", error);
    return NextResponse.json(
      { error: "Failed to fetch goals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = createGoalSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // SECURITY: Validate tableId and productId belong to user's company
    if (body.tableId) {
      const table = await withRetry(() => prisma.tableMeta.findFirst({
        where: { id: body.tableId, companyId: user.companyId },
        select: { id: true },
      }));
      if (!table) {
        return NextResponse.json({ error: "Invalid tableId" }, { status: 400 });
      }
    }
    if (body.productId) {
      const product = await withRetry(() => prisma.product.findFirst({
        where: { id: body.productId, companyId: user.companyId },
        select: { id: true },
      }));
      if (!product) {
        return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
      }
    }

    const goal = await withRetry(() => prisma.goal.create({
      data: {
        companyId: user.companyId,
        name: body.name,
        metricType: body.metricType,
        targetValue: new Decimal(body.targetValue),
        targetType: body.targetType,
        periodType: body.periodType,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        filters: body.filters,
        tableId: body.tableId ?? null,
        productId: body.productId ?? null,
        warningThreshold: body.warningThreshold,
        criticalThreshold: body.criticalThreshold,
        notes: body.notes ?? null,
      },
    }));

    // Invalidate goals cache so dashboard reflects the new goal
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
    console.error("Failed to create goal:", error);
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
