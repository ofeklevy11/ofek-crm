import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceClientAPI");

const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  businessName: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

function parseClientId(id: string): number | null {
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
    const clientId = parseClientId(id);
    if (clientId === null) {
      return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
    }

    // CRITICAL: Filter by companyId + soft delete
    const client = await withRetry(() => prisma.client.findFirst({
      where: { id: clientId, companyId: user.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        businessName: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        retainers: {
          where: { deletedAt: null },
          select: { id: true, amount: true, frequency: true, status: true, nextDueDate: true, createdAt: true },
          take: 50,
          orderBy: { createdAt: "desc" as const },
        },
        oneTimePayments: {
          where: { deletedAt: null },
          select: { id: true, amount: true, status: true, dueDate: true, paidDate: true, title: true, createdAt: true },
          take: 50,
          orderBy: { createdAt: "desc" as const },
        },
        transactions: {
          where: { deletedAt: null },
          select: { id: true, amount: true, status: true, notes: true, attemptDate: true, paidDate: true, createdAt: true },
          take: 50,
          orderBy: { createdAt: "desc" as const },
        },
      },
    }));

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    log.error("Failed to fetch client", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch client" },
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

    const { id } = await params;
    const clientId = parseClientId(id);
    if (clientId === null) {
      return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const raw = await request.json();
    const parsed = updateClientSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = parsed.data;

    // CRITICAL: Verify client belongs to user's company + update atomically
    const updatedClient = await withRetry(() => prisma.$transaction(async (tx) => {
      const existingClient = await tx.client.findFirst({
        where: { id: clientId, companyId: user.companyId, deletedAt: null },
      });

      if (!existingClient) {
        return null;
      }

      return tx.client.update({
        where: { id: clientId, companyId: user.companyId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.businessName !== undefined && { businessName: data.businessName }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          businessName: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }, { isolationLevel: "RepeatableRead" }));

    if (!updatedClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(updatedClient);
  } catch (error) {
    log.error("Failed to update client", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update client" },
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

    const { id } = await params;
    const clientId = parseClientId(id);
    if (clientId === null) {
      return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    // P3: Soft-delete client and all related financial records atomically (TOCTOU-safe)
    const deleted = await withRetry(() => prisma.$transaction(async (tx) => {
      // CRITICAL: Verify client belongs to user's company inside transaction
      const existingClient = await tx.client.findFirst({
        where: { id: clientId, companyId: user.companyId, deletedAt: null },
      });

      if (!existingClient) {
        return false;
      }

      const companyId = existingClient.companyId;
      const now = new Date();

      await Promise.all([
        tx.transaction.updateMany({
          where: { clientId, companyId, deletedAt: null },
          data: { deletedAt: now },
        }),
        tx.retainer.updateMany({
          where: { clientId, companyId, deletedAt: null },
          data: { deletedAt: now },
        }),
        tx.oneTimePayment.updateMany({
          where: { clientId, companyId, deletedAt: null },
          data: { deletedAt: now },
        }),
        tx.financeRecord.updateMany({
          where: { clientId, companyId, deletedAt: null },
          data: { deletedAt: now },
        }),
      ]);
      await tx.client.update({
        where: { id: clientId, companyId },
        data: { deletedAt: now },
      });

      return true;
    }, { isolationLevel: "RepeatableRead" }));

    if (!deleted) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete client", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
