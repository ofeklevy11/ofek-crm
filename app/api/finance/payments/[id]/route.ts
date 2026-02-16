import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { normalizePaymentStatus } from "@/lib/finance-constants";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinancePaymentAPI");

const updatePaymentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.coerce.date().optional(),
  status: z.string().max(50).optional(),
  paidDate: z.coerce.date().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

function parsePaymentId(id: string): number | null {
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

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const { id } = await params;
    const paymentId = parsePaymentId(id);
    if (paymentId === null) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    // CRITICAL: Filter by companyId + soft delete
    const payment = await withRetry(() => prisma.oneTimePayment.findFirst({
      where: {
        id: paymentId,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, clientId: true, title: true, amount: true, dueDate: true,
        paidDate: true, status: true, notes: true, createdAt: true, updatedAt: true,
        client: {
          select: { id: true, name: true, email: true, phone: true, businessName: true },
        },
      },
    }));

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    log.error("Failed to fetch payment", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch payment" },
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

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const { id } = await params;
    const paymentId = parsePaymentId(id);
    if (paymentId === null) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    const raw = await request.json();
    const parsed = updatePaymentSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = parsed.data;

    // P2: Normalize status to canonical value
    let normalizedStatus: string | undefined;
    if (data.status) {
      const normalized = normalizePaymentStatus(data.status);
      if (!normalized) {
        return NextResponse.json({ error: `Invalid status: ${data.status}` }, { status: 400 });
      }
      normalizedStatus = normalized;
    }

    // Verify ownership + update atomically to prevent TOCTOU race
    const updatedPayment = await withRetry(() => prisma.$transaction(async (tx) => {
      const existingPayment = await tx.oneTimePayment.findFirst({
        where: {
          id: paymentId,
          companyId: user.companyId,
          deletedAt: null,
        },
      });

      if (!existingPayment) return null;

      return tx.oneTimePayment.update({
        where: { id: paymentId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
          ...(normalizedStatus !== undefined && { status: normalizedStatus }),
          ...(data.paidDate !== undefined
            ? { paidDate: data.paidDate }
            : normalizedStatus === "paid"
            ? { paidDate: new Date() }
            : {}),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        select: {
          id: true,
          clientId: true,
          title: true,
          amount: true,
          dueDate: true,
          paidDate: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }, { isolationLevel: "RepeatableRead" }));

    if (!updatedPayment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(updatedPayment);
  } catch (error) {
    log.error("Failed to update payment", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
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

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const { id } = await params;
    const paymentId = parsePaymentId(id);
    if (paymentId === null) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    // P3: Soft delete for audit trail
    const deleted = await withRetry(() => prisma.$transaction(async (tx) => {
      const existingPayment = await tx.oneTimePayment.findFirst({
        where: {
          id: paymentId,
          companyId: user.companyId,
          deletedAt: null,
        },
      });

      if (!existingPayment) return false;

      await tx.oneTimePayment.update({
        where: { id: paymentId },
        data: { deletedAt: new Date() },
      });
      return true;
    }, { isolationLevel: "RepeatableRead" }));

    if (!deleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete payment", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}
