"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PAID_STATUS_VARIANTS, normalizePaymentStatus, VALID_PAYMENT_STATUSES } from "@/lib/finance-constants";
import { withRetry } from "@/lib/db-retry";
import { hasUserFlag } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/permissions-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("Finance");

// ==================== RETAINERS ====================

// ==================== RETAINERS ====================

export async function getRetainers(opts?: { cursor?: number; take?: number }) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const take = Math.min(opts?.take ?? 500, 500);
    const retainers = await withRetry(() => prisma.retainer.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, clientId: true, title: true, amount: true, frequency: true,
        startDate: true, nextDueDate: true, status: true, notes: true,
        createdAt: true, updatedAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1, // Fetch one extra to determine hasMore
      ...(opts?.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    }));

    const hasMore = retainers.length > take;
    const data = retainers.slice(0, take);
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return {
      success: true,
      data: data.map((r) => ({ ...r, amount: Number(r.amount) })),
      nextCursor,
      hasMore,
    };
  } catch (error) {
    log.error("Error fetching retainers", { error: String(error) });
    return { success: false, error: "Failed to fetch retainers" };
  }
}

export async function getRetainerById(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid ID" };

    const retainer = await withRetry(() => prisma.retainer.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, clientId: true, title: true, amount: true, frequency: true,
        startDate: true, nextDueDate: true, status: true, notes: true,
        createdAt: true, updatedAt: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
    }));

    if (!retainer) {
      return { success: false, error: "Retainer not found" };
    }

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
  } catch (error) {
    log.error("Error fetching retainer", { error: String(error) });
    return { success: false, error: "Failed to fetch retainer" };
  }
}

export async function createRetainer(data: {
  title: string;
  clientId: number;
  amount: number;
  frequency: string;
  startDate: string;
  paymentMode?: "prepaid" | "postpaid";
  notes?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const {
      title,
      clientId,
      amount,
      frequency,
      startDate,
      paymentMode,
      notes,
    } = data;

    // H9: Input validation
    if (!title || typeof title !== "string" || title.length > 200) {
      return { success: false, error: "Title is required and must be under 200 characters" };
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Amount must be a positive number" };
    }
    if (notes && (typeof notes !== "string" || notes.length > 5000)) {
      return { success: false, error: "Notes must be under 5000 characters" };
    }
    if (!["monthly", "quarterly", "annually"].includes(frequency)) {
      return { success: false, error: "Invalid frequency" };
    }
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return { success: false, error: "Invalid client ID" };
    }

    // Calculate next due date based on frequency
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return { success: false, error: "Invalid start date" };
    }
    const nextDueDate = new Date(start);

    // If postpaid (default), add one interval. If prepaid, start immediately.
    if (paymentMode !== "prepaid") {
      switch (frequency) {
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
    }

    // H1: Wrap client verify + create in transaction to prevent TOCTOU race
    const retainer = await withRetry(() => prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, companyId: user.companyId, deletedAt: null },
      });
      if (!client) {
        throw new Error("Invalid client");
      }

      return tx.retainer.create({
        data: {
          title,
          clientId,
          companyId: user.companyId,
          amount,
          frequency: frequency as "monthly" | "quarterly" | "annually",
          startDate: start,
          nextDueDate,
          status: "active" as const,
          notes,
        },
        select: {
          id: true, clientId: true, title: true, amount: true, frequency: true,
          startDate: true, nextDueDate: true, status: true, notes: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
  } catch (error) {
    log.error("Error creating retainer", { error: String(error) });
    return { success: false, error: "Failed to create retainer" };
  }
}

export async function updateRetainer(
  id: number,
  data: {
    title?: string;
    amount?: number;
    frequency?: string;
    status?: string;
    notes?: string;
    nextDueDate?: string;
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Validate ID
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: "Invalid retainer ID" };
    }

    // P2: Validate retainer status
    if (data.status !== undefined && !["active", "paused", "cancelled"].includes(data.status)) {
      return { success: false, error: `Invalid retainer status: ${data.status}` };
    }

    // SECURITY: Whitelist allowed fields to prevent companyId/id/deletedAt injection
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) {
      if (typeof data.title !== "string" || data.title.length > 200) return { success: false, error: "Invalid title" };
      updateData.title = data.title;
    }
    if (data.amount !== undefined) {
      if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) return { success: false, error: "Invalid amount" };
      updateData.amount = data.amount;
    }
    if (data.frequency !== undefined) {
      if (!["monthly", "quarterly", "annually"].includes(data.frequency)) return { success: false, error: "Invalid frequency" };
      updateData.frequency = data.frequency;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) {
      if (data.notes !== null && (typeof data.notes !== "string" || data.notes.length > 5000)) return { success: false, error: "Invalid notes" };
      updateData.notes = data.notes;
    }
    if (data.nextDueDate !== undefined) {
      const parsed = new Date(data.nextDueDate);
      if (isNaN(parsed.getTime())) return { success: false, error: "Invalid next due date" };
      updateData.nextDueDate = parsed;
    }

    // SECURITY: Atomic verify+update in transaction to prevent TOCTOU race
    const retainer = await withRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.retainer.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!existing) {
        throw new Error("Unauthorized");
      }
      return tx.retainer.update({
        where: { id },
        data: updateData,
        select: {
          id: true, clientId: true, title: true, amount: true, frequency: true,
          startDate: true, nextDueDate: true, status: true, notes: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
  } catch (error) {
    log.error("Error updating retainer", { error: String(error) });
    return { success: false, error: "Failed to update retainer" };
  }
}

export async function deleteRetainer(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid retainer ID" };

    // P3: Soft delete — mark as deleted instead of hard delete for audit trail
    await withRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.retainer.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!existing) {
        throw new Error("Unauthorized");
      }

      const now = new Date();

      // Soft-delete associated retainer payments
      await tx.oneTimePayment.updateMany({
        where: {
          clientId: existing.clientId,
          companyId: user.companyId,
          notes: { contains: `ריטיינר #${id}` },
          deletedAt: null,
        },
        data: { deletedAt: now },
      });

      await tx.retainer.update({
        where: { id },
        data: { deletedAt: now },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    log.error("Error deleting retainer", { error: String(error) });
    return { success: false, error: "Failed to delete retainer" };
  }
}

// ==================== PAYMENTS ====================

export async function getPayments(opts?: { cursor?: number; take?: number }) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const take = Math.min(opts?.take ?? 500, 500);
    const payments = await withRetry(() => prisma.oneTimePayment.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, clientId: true, title: true, amount: true, dueDate: true,
        paidDate: true, status: true, notes: true, createdAt: true, updatedAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts?.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    }));

    const hasMore = payments.length > take;
    const data = payments.slice(0, take);
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return {
      success: true,
      data: data.map((p) => ({ ...p, amount: Number(p.amount) })),
      nextCursor,
      hasMore,
    };
  } catch (error) {
    log.error("Error fetching payments", { error: String(error) });
    return { success: false, error: "Failed to fetch payments" };
  }
}

export async function getPaymentById(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid ID" };

    const payment = await withRetry(() => prisma.oneTimePayment.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, clientId: true, title: true, amount: true, dueDate: true,
        paidDate: true, status: true, notes: true, createdAt: true, updatedAt: true,
        client: { select: { id: true, name: true, email: true, phone: true, businessName: true } },
      },
    }));

    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    return {
      success: true,
      data: { ...payment, amount: Number(payment.amount) },
    };
  } catch (error) {
    log.error("Error fetching payment", { error: String(error) });
    return { success: false, error: "Failed to fetch payment" };
  }
}

export async function createPayment(data: {
  title: string;
  clientId: number;
  amount: number;
  dueDate: string;
  notes?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { title, clientId, amount, dueDate, notes } = data;

    // H10: Input validation
    if (!title || typeof title !== "string" || title.length > 200) {
      return { success: false, error: "Title is required and must be under 200 characters" };
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Amount must be a positive number" };
    }
    if (notes && (typeof notes !== "string" || notes.length > 5000)) {
      return { success: false, error: "Notes must be under 5000 characters" };
    }
    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return { success: false, error: "Invalid due date" };
    }
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return { success: false, error: "Invalid client ID" };
    }

    // H2: Wrap client verify + create in transaction to prevent TOCTOU race
    const payment = await withRetry(() => prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, companyId: user.companyId, deletedAt: null },
      });
      if (!client) {
        throw new Error("Invalid client");
      }

      return tx.oneTimePayment.create({
        data: {
          title,
          clientId,
          companyId: user.companyId,
          amount,
          dueDate: parsedDueDate,
          status: "pending",
          notes,
        },
        select: {
          id: true, clientId: true, title: true, amount: true, dueDate: true,
          paidDate: true, status: true, notes: true, createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/");

    return {
      success: true,
      data: { ...payment, amount: Number(payment.amount) },
    };
  } catch (error) {
    log.error("Error creating payment", { error: String(error) });
    return { success: false, error: "Failed to create payment" };
  }
}

export async function updatePayment(
  id: number,
  data: {
    title?: string;
    amount?: number;
    dueDate?: string;
    status?: string;
    notes?: string;
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid payment ID" };

    // P2: Normalize status to canonical value before writing
    let normalizedStatus: string | undefined;
    if (data.status) {
      const normalized = normalizePaymentStatus(data.status);
      if (!normalized) return { success: false, error: `Invalid status: ${data.status}` };
      normalizedStatus = normalized;
    }

    // SECURITY: Whitelist allowed fields to prevent companyId/id/deletedAt injection
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) {
      if (typeof data.title !== "string" || data.title.length > 200) return { success: false, error: "Invalid title" };
      updateData.title = data.title;
    }
    if (data.amount !== undefined) {
      if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) return { success: false, error: "Invalid amount" };
      updateData.amount = data.amount;
    }
    if (data.dueDate !== undefined) {
      const parsed = new Date(data.dueDate);
      if (isNaN(parsed.getTime())) return { success: false, error: "Invalid due date" };
      updateData.dueDate = parsed;
    }
    if (normalizedStatus !== undefined) updateData.status = normalizedStatus;
    if (data.notes !== undefined) {
      if (data.notes !== null && (typeof data.notes !== "string" || data.notes.length > 5000)) return { success: false, error: "Invalid notes" };
      updateData.notes = data.notes;
    }

    // SECURITY: Atomic verify+update in transaction to prevent TOCTOU race
    const { payment, clientCompanyId } = await withRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.oneTimePayment.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!existing) {
        throw new Error("Unauthorized");
      }
      const updated = await tx.oneTimePayment.update({
        where: { id },
        data: updateData,
        select: {
          id: true, clientId: true, title: true, amount: true, dueDate: true,
          paidDate: true, status: true, notes: true, createdAt: true, updatedAt: true,
        },
      });
      return { payment: updated, clientCompanyId: existing.companyId };
    }, { maxWait: 5000, timeout: 10000 }));

    // --- REAL-TIME FINANCE SYNC FOR PAYMENTS ---
    // P11: Sync fires after tx commits — if it fails, the hourly cron catches up.
    // Intentionally outside the transaction to avoid holding locks during Inngest enqueue.
    if (data.status && (PAID_STATUS_VARIANTS as readonly string[]).includes(data.status)) {
      try {
        const { triggerSyncByType } = await import("@/lib/finance-sync-internal");
        await triggerSyncByType(
          clientCompanyId,
          "PAYMENTS_RETAINERS",
        );
      } catch (err) {
        log.error("Error triggering sync on payment update", { error: String(err) });
      }
    }

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/finance/income-expenses");
    revalidatePath("/");

    return {
      success: true,
      data: { ...payment, amount: Number(payment.amount) },
    };
  } catch (error) {
    log.error("Error updating payment", { error: String(error) });
    return { success: false, error: "Failed to update payment" };
  }
}

export async function deletePayment(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid payment ID" };

    // P3: Soft delete for audit trail
    await withRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.oneTimePayment.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!existing) {
        throw new Error("Unauthorized");
      }
      await tx.oneTimePayment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    log.error("Error deleting payment", { error: String(error) });
    return { success: false, error: "Failed to delete payment" };
  }
}

// ==================== CLIENT SEARCH ====================

export async function searchClients(searchTerm: string) {
  try {
    if (typeof searchTerm !== "string" || searchTerm.length > 200) {
      return { success: false, error: "Invalid search term" };
    }

    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    // Search the Client model directly (primary source for finance)
    const clients = await withRetry(() => prisma.client.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null, // P3: Soft delete filter
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { email: { contains: searchTerm, mode: "insensitive" } },
          { businessName: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true, businessName: true },
      take: 20,
    }));

    return { success: true, data: clients };
  } catch (error) {
    log.error("Error searching clients", { error: String(error) });
    return { success: false, error: "Failed to search clients" };
  }
}

export async function getFinanceClients(opts?: { cursor?: number; take?: number }) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewFinance")) {
      return { success: false, error: "Forbidden" };
    }

    const take = Math.min(opts?.take ?? 500, 500);
    const clients = await withRetry(() => prisma.client.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true, email: true, phone: true, businessName: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts?.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    }));

    const hasMore = clients.length > take;
    const data = clients.slice(0, take);
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return { success: true, data, nextCursor, hasMore };
  } catch (error) {
    log.error("Error fetching finance clients", { error: String(error) });
    return { success: false, error: "Failed to fetch finance clients" };
  }
}
