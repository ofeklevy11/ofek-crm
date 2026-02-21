import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { goalFiltersSchema, MAX_GOALS_PER_COMPANY, MAX_GOAL_PAYLOAD_BYTES } from "@/lib/validations/goal";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceGoalsAPI");

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
  filters: goalFiltersSchema.default({}),
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

    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canViewGoals")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.goalRead);
    if (limited) return limited;

    const goals = await withRetry(() => prisma.goal.findMany({
      where: { companyId: user.companyId, isArchived: false },
      select: {
        id: true, name: true, metricType: true, targetType: true, targetValue: true,
        periodType: true, startDate: true, endDate: true, filters: true,
        warningThreshold: true, criticalThreshold: true,
        isActive: true, isArchived: true, order: true, notes: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: [{ order: "asc" }, { endDate: "asc" }],
      take: 200,
    }));

    return NextResponse.json(goals);
  } catch (error) {
    log.error("Failed to fetch goals", { error: String(error) });
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

    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canViewGoals")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const parsed = createGoalSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Atomic count + validation + create in a Serializable transaction to prevent TOCTOU race
    const goal = await prisma.$transaction(async (tx) => {
      // Goal count cap
      const activeGoalCount = await tx.goal.count({
        where: { companyId: user.companyId, isArchived: false },
      });
      if (activeGoalCount >= MAX_GOALS_PER_COMPANY) {
        throw new Error(`MAX_GOALS`);
      }

      // SECURITY: Validate tableId and productId belong to user's company
      if (body.tableId) {
        const table = await tx.tableMeta.findFirst({
          where: { id: body.tableId, companyId: user.companyId },
          select: { id: true },
        });
        if (!table) throw new Error("INVALID_TABLE");
      }
      if (body.productId) {
        const product = await tx.product.findFirst({
          where: { id: body.productId, companyId: user.companyId },
          select: { id: true },
        });
        if (!product) throw new Error("INVALID_PRODUCT");
      }

      return tx.goal.create({
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
          warningThreshold: body.warningThreshold,
          criticalThreshold: body.criticalThreshold,
          notes: body.notes ?? null,
        },
        select: {
          id: true, name: true, metricType: true, targetType: true, targetValue: true,
          periodType: true, startDate: true, endDate: true, filters: true,
          warningThreshold: true, criticalThreshold: true,
          isActive: true, isArchived: true, order: true, notes: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // Invalidate stale cache immediately so next page load does live computation
    try {
      const { invalidateGoalsCache } = await import("@/lib/services/dashboard-cache");
      await invalidateGoalsCache(user.companyId);
    } catch (e) {
      log.error("Failed to invalidate goals cache", { error: String(e) });
    }

    // Trigger background refresh to warm the cache
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
  } catch (error: any) {
    const msg = error?.message;
    if (msg === "MAX_GOALS") {
      return NextResponse.json(
        { error: `Maximum of ${MAX_GOALS_PER_COMPANY} active goals reached` },
        { status: 400 }
      );
    }
    if (msg === "INVALID_TABLE") {
      return NextResponse.json({ error: "Invalid tableId" }, { status: 400 });
    }
    if (msg === "INVALID_PRODUCT") {
      return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
    }
    log.error("Failed to create goal", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
