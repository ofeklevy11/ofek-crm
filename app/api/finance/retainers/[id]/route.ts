import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("RetainerAPI");

const updateRetainerSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["monthly", "quarterly", "annually"]).optional(),
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  nextDueDate: z.coerce.date().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

function parseRetainerId(id: string): number | null {
  const parsed = parseInt(id, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function handleGET(
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

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const { id } = await params;
    const retainerId = parseRetainerId(id);
    if (retainerId === null) {
      return NextResponse.json({ error: "Invalid retainer ID" }, { status: 400 });
    }

    // CRITICAL: Filter by companyId + soft delete
    const retainer = await withRetry(() => prisma.retainer.findFirst({
      where: {
        id: retainerId,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, clientId: true, title: true, amount: true, frequency: true,
        startDate: true, nextDueDate: true, status: true, notes: true,
        createdAt: true, updatedAt: true,
        client: {
          select: { id: true, name: true, email: true, phone: true, businessName: true },
        },
      },
    }));

    if (!retainer) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(retainer);
  } catch (error) {
    log.error("Failed to fetch retainer", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch retainer" },
      { status: 500 }
    );
  }
}

async function handlePATCH(
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

    const { id } = await params;
    const retainerId = parseRetainerId(id);
    if (retainerId === null) {
      return NextResponse.json({ error: "Invalid retainer ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const raw = await request.json();
    const parsed = updateRetainerSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = parsed.data;

    // RepeatableRead transaction eliminates TOCTOU between ownership check and update
    const updatedRetainer = await withRetry(() => prisma.$transaction(
      async (tx) => {
        const existing = await tx.retainer.findFirst({
          where: {
            id: retainerId,
            companyId: user.companyId,
            deletedAt: null,
          },
        });
        if (!existing) return null;

        return tx.retainer.update({
          where: { id: retainerId },
          data: {
            ...(data.title !== undefined && { title: data.title }),
            ...(data.amount !== undefined && { amount: data.amount }),
            ...(data.frequency !== undefined && { frequency: data.frequency }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.nextDueDate !== undefined && { nextDueDate: data.nextDueDate }),
            ...(data.notes !== undefined && { notes: data.notes }),
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
            updatedAt: true,
          },
        });
      },
      { isolationLevel: "RepeatableRead" },
    ));

    if (!updatedRetainer) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedRetainer);
  } catch (error) {
    log.error("Failed to update retainer", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update retainer" },
      { status: 500 }
    );
  }
}

async function handleDELETE(
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

    const { id } = await params;
    const retainerId = parseRetainerId(id);
    if (retainerId === null) {
      return NextResponse.json({ error: "Invalid retainer ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    // P3: Soft delete for audit trail — scoped to company
    const { count } = await withRetry(() => prisma.retainer.updateMany({
      where: {
        id: retainerId,
        companyId: user.companyId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    }));

    if (count === 0) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete retainer", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete retainer" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/finance/retainers/[id]", handleGET);
export const PATCH = withMetrics("/api/finance/retainers/[id]", handlePATCH);
export const DELETE = withMetrics("/api/finance/retainers/[id]", handleDELETE);
