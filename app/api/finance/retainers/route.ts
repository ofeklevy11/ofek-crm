import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("RetainersAPI");

const createRetainerSchema = z.object({
  title: z.string().min(1).max(200),
  clientId: z.coerce.number().int().positive(),
  amount: z.number().positive(),
  frequency: z.enum(["monthly", "quarterly", "annually"]),
  startDate: z.coerce.date(),
  notes: z.string().max(5000).nullable().optional(),
});

async function handlePOST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const raw = await request.json();
    const parsed = createRetainerSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const body = parsed.data;

    // Calculate next due date based on frequency
    const start = body.startDate;
    const nextDueDate = new Date(start);

    switch (body.frequency) {
      case "monthly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        break;
      case "quarterly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 3);
        break;
      case "annually":
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        break;
    }

    // H4: Wrap client verify + create in transaction to prevent TOCTOU race
    const retainer = await withRetry(() => prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: body.clientId, companyId: user.companyId, deletedAt: null },
      });
      if (!client) {
        return null;
      }

      return tx.retainer.create({
        data: {
          title: body.title,
          clientId: body.clientId,
          companyId: user.companyId,
          amount: body.amount,
          frequency: body.frequency,
          startDate: start,
          nextDueDate,
          status: "active",
          notes: body.notes ?? null,
        },
        select: {
          id: true,
          clientId: true,
          title: true,
          amount: true,
          frequency: true,
          startDate: true,
          nextDueDate: true,
          status: true,
          notes: true,
          createdAt: true,
        },
      });
    }));

    if (!retainer) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(retainer, { status: 201 });
  } catch (error) {
    log.error("Failed to create retainer", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create retainer" },
      { status: 500 }
    );
  }
}

export const POST = withMetrics("/api/finance/retainers", handlePOST);
