"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceRecords");

export type FinanceRecordType = "INCOME" | "EXPENSE";

export interface CreateFinanceRecordInput {
  title: string;
  amount: number;
  type: FinanceRecordType;
  category?: string;
  date: Date;
  status?: string;
  description?: string;
  clientId?: number;
}

// Fetch records with optional filters
export async function getFinanceRecords(filters?: {
  type?: FinanceRecordType;
  startDate?: Date;
  endDate?: Date;
  categoryId?: string;
  cursor?: number;
  take?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  // Issue 27: Removed processFixedExpenses() from read path — use scheduled cron instead

  const where: any = {
    companyId: user.companyId,
    deletedAt: null, // P3: Soft delete filter
    ...(filters?.type && { type: filters.type }),
    ...(filters?.startDate &&
      filters?.endDate && {
        date: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
      }),
    ...(filters?.categoryId && { category: filters.categoryId }),
  };

  const take = Math.min(filters?.take ?? 500, 500);
  const [records, totals] = await Promise.all([
    withRetry(() => prisma.financeRecord.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters?.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
      select: {
        id: true, title: true, amount: true, type: true, category: true,
        date: true, status: true, clientId: true, description: true,
        originId: true, syncRuleId: true, createdAt: true, updatedAt: true,
        client: { select: { id: true, name: true } },
        syncRule: { select: { sourceType: true, name: true } },
      },
    })),
    withRetry(() => prisma.financeRecord.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
    })),
  ]);

  const hasMore = records.length > take;
  const pageRecords = records.slice(0, take);
  const nextCursor = hasMore ? pageRecords[pageRecords.length - 1]?.id ?? null : null;

  const income = Number(
    totals.find((t) => t.type === "INCOME")?._sum.amount || 0
  );
  const expenses = Number(
    totals.find((t) => t.type === "EXPENSE")?._sum.amount || 0
  );

  return {
    records: pageRecords.map((r) => ({ ...r, amount: Number(r.amount) })),
    stats: { income, expenses, profit: income - expenses },
    nextCursor,
    hasMore,
  };
}

// Add a new financial record
export async function addFinanceRecord(data: CreateFinanceRecordInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // H3: Validate positive amount
  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("Amount must be positive");
  }

  // Input validation — server actions receive untrusted input
  if (!data.title || typeof data.title !== "string" || data.title.length > 200) {
    throw new Error("Title is required and must be under 200 characters");
  }
  if (!["INCOME", "EXPENSE"].includes(data.type)) {
    throw new Error("Type must be INCOME or EXPENSE");
  }
  if (data.category && (typeof data.category !== "string" || data.category.length > 200)) {
    throw new Error("Category must be under 200 characters");
  }
  if (data.description && (typeof data.description !== "string" || data.description.length > 5000)) {
    throw new Error("Description must be under 5000 characters");
  }
  if (data.status && !["PENDING", "COMPLETED", "CANCELLED"].includes(data.status)) {
    throw new Error("Invalid status");
  }
  if (!(data.date instanceof Date) || isNaN(data.date.getTime())) {
    throw new Error("Invalid date");
  }
  if (data.clientId !== undefined && (!Number.isInteger(data.clientId) || data.clientId <= 0)) {
    throw new Error("Invalid client ID");
  }

  // H5: Wrap client verify + create in transaction to prevent TOCTOU race
  const record = await withRetry(() => prisma.$transaction(async (tx) => {
    if (data.clientId) {
      const client = await tx.client.findFirst({
        where: { id: data.clientId, companyId: user.companyId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new Error("Invalid client");
    }

    return tx.financeRecord.create({
      data: {
        companyId: user.companyId,
        title: data.title,
        amount: data.amount,
        type: data.type as any,
        category: data.category,
        date: data.date,
        status: (data.status || "COMPLETED") as any,
        description: data.description,
        clientId: data.clientId,
      },
      select: {
        id: true, title: true, amount: true, type: true, category: true,
        date: true, status: true, clientId: true, description: true,
        createdAt: true, updatedAt: true,
      },
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/finance/income-expenses");
  revalidatePath("/finance");
  return { ...record, amount: Number(record.amount) };
}

// Delete a record
export async function deleteFinanceRecord(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    return { success: false, error: "Rate limit exceeded" };
  }

  if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid record ID" };

  // H6: Wrap findFirst + soft-delete in transaction to prevent TOCTOU race
  const financeRecord = await withRetry(() => prisma.$transaction(async (tx) => {
    const record = await tx.financeRecord.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, originId: true,
        syncRule: { select: { id: true, sourceType: true } },
      },
    });

    if (!record) return null;

    // P3: Soft delete the finance record for audit trail
    await tx.financeRecord.update({
      where: { id, companyId: user.companyId },
      data: { deletedAt: new Date() },
    });

    return record;
  }, { maxWait: 5000, timeout: 10000 }));

  if (!financeRecord) return { success: false, error: "Record not found" };

  // 2. Cascade delete source record if applicable
  if (
    financeRecord.syncRule &&
    financeRecord.syncRule.sourceType === "TABLE" &&
    financeRecord.originId
  ) {
    try {
      const sourceRecordId = parseInt(financeRecord.originId, 10);
      // Verify the record still exists and belongs to user's company (via table permissions usually, but here we trust the link)
      // Check if record exists specifically
      const sourceRecord = await withRetry(() => prisma.record.findFirst({
        where: { id: sourceRecordId, companyId: user.companyId },
        include: { table: true },
      }));

      if (sourceRecord) {
        const { deleteRecordWithCleanup } = await import("@/lib/record-cleanup");
        await deleteRecordWithCleanup(sourceRecordId, {
          companyId: user.companyId,
          tableId: sourceRecord.table.id,
          userId: user.id,
          skipFinanceCascade: true,
        });
      }
    } catch (e) {
      log.error("Failed to cascade delete to source record", { error: String(e) });
    }
  }

  revalidatePath("/finance/income-expenses");
  revalidatePath("/finance");
  revalidatePath("/tables"); // Revalidate tables as well since we might have deleted a record there
  return { success: true };
}
