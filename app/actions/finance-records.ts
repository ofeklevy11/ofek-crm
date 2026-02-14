"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
// import { Prisma } from "@prisma/client";

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
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Issue 27: Removed processFixedExpenses() from read path — use scheduled cron instead

  const where: any = {
    companyId: user.companyId,
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

  // P119: Add take limit to prevent unbounded finance record loads
  const records = await prisma.financeRecord.findMany({
    where,
    orderBy: { date: "desc" },
    take: 5000,
    include: {
      client: { select: { id: true, name: true } },
      syncRule: { select: { sourceType: true, name: true } },
    },
  });

  // Issue 26: Apply same filters to totals so they match the filtered records view
  const totals = await prisma.financeRecord.groupBy({
    by: ["type"],
    where,
    _sum: { amount: true },
  });

  const income = Number(
    totals.find((t) => t.type === "INCOME")?._sum.amount || 0
  );
  const expenses = Number(
    totals.find((t) => t.type === "EXPENSE")?._sum.amount || 0
  );

  return {
    records: records.map((r) => ({ ...r, amount: Number(r.amount) })),
    stats: { income, expenses, profit: income - expenses },
  };
}

// Add a new financial record
export async function addFinanceRecord(data: CreateFinanceRecordInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // SECURITY: Validate clientId belongs to user's company
  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) throw new Error("Invalid client");
  }

  console.log(
    `[Finance] Creating record for User ${user.id} in Company ${user.companyId}`
  );

  const record = await prisma.financeRecord.create({
    data: {
      companyId: user.companyId, // Explicitly use the authenticated user's company ID
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

  revalidatePath("/finance/income-expenses");
  revalidatePath("/finance");
  return { ...record, amount: Number(record.amount) };
}

// Delete a record
export async function deleteFinanceRecord(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch the record first to handle cascading delete
  const financeRecord = await prisma.financeRecord.findUnique({
    where: { id, companyId: user.companyId },
    include: { syncRule: true },
  });

  if (!financeRecord) return { success: false, error: "Record not found" };

  // 1. Delete the finance record
  await prisma.financeRecord.delete({
    where: { id, companyId: user.companyId },
  });

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
      const sourceRecord = await prisma.record.findFirst({
        where: { id: sourceRecordId, companyId: user.companyId },
        include: { table: true },
      });

      if (sourceRecord) {
        const { deleteRecordWithCleanup } = await import("@/lib/record-cleanup");
        await deleteRecordWithCleanup(sourceRecordId, {
          companyId: user.companyId,
          tableId: sourceRecord.table.id,
          userId: user.id,
          skipFinanceCascade: true,
        });
        console.log(
          `[Finance] Cascaded delete to Source Record #${sourceRecordId}`
        );
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
