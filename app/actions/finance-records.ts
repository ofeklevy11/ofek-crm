"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { withRetry } from "@/lib/db-retry";

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

  const take = Math.min(filters?.take ?? 5000, 5000);
  const records = await withRetry(() => prisma.financeRecord.findMany({
    where,
    orderBy: { date: "desc" },
    take: take + 1,
    ...(filters?.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
    include: {
      client: { select: { id: true, name: true } },
      syncRule: { select: { sourceType: true, name: true } },
    },
  }));

  const hasMore = records.length > take;
  const pageRecords = records.slice(0, take);
  const nextCursor = hasMore ? pageRecords[pageRecords.length - 1]?.id : undefined;

  // Issue 26: Apply same filters to totals so they match the filtered records view
  const totals = await withRetry(() => prisma.financeRecord.groupBy({
    by: ["type"],
    where,
    _sum: { amount: true },
  }));

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

  // H3: Validate positive amount
  if (typeof data.amount !== "number" || data.amount <= 0) {
    throw new Error("Amount must be positive");
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
        type: data.type,
        category: data.category,
        date: data.date,
        status: data.status || "COMPLETED",
        description: data.description,
        clientId: data.clientId,
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

  // H6: Wrap findFirst + soft-delete in transaction to prevent TOCTOU race
  const financeRecord = await withRetry(() => prisma.$transaction(async (tx) => {
    const record = await tx.financeRecord.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { syncRule: true },
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
      const sourceRecordId = parseInt(financeRecord.originId);
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
      console.error(`[Finance] Failed to cascade delete to source record:`, e);
    }
  }

  revalidatePath("/finance/income-expenses");
  revalidatePath("/finance");
  revalidatePath("/tables"); // Revalidate tables as well since we might have deleted a record there
  return { success: true };
}
