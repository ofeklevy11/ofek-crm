"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { VALID_FIXED_EXPENSE_STATUSES } from "@/lib/finance-constants";
import { getValidDate } from "@/lib/date-utils";
import { withRetry } from "@/lib/db-retry";

export async function getFixedExpenses(opts?: { cursor?: number; take?: number }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const take = Math.min(opts?.take ?? 500, 500);
  const [expenses, financeRecords] = await Promise.all([
    withRetry(() => prisma.fixedExpense.findMany({
      where: {
        companyId: user.companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: take + 1,
      ...(opts?.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      select: {
        id: true, title: true, amount: true, frequency: true,
        payDay: true, category: true, description: true,
        startDate: true, status: true,
        createdAt: true, updatedAt: true,
      },
    })),
    withRetry(() => prisma.financeRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        originId: {
          startsWith: "fixed_",
        },
      },
      select: {
        originId: true,
      },
    })),
  ]);

  const hasMore = expenses.length > take;
  const pageExpenses = expenses.slice(0, take);

  const recordMap = new Set(financeRecords.map((r) => r.originId));
  const today = new Date();

  const nextCursor = hasMore ? pageExpenses[pageExpenses.length - 1]?.id : undefined;

  // Enhance expenses with status
  const data = pageExpenses.map((expense: any) => {
    const startDate = expense.startDate || expense.createdAt;
    const frequency = expense.frequency;
    const payDay = expense.payDay || startDate.getDate();
    const baseOriginId = `fixed_${expense.id}`;

    let pendingCount = 0;
    let paidFutureCount = 0;
    let nextPaymentDate: Date | null = null;
    let lastPaidDate: Date | null = null;

    // Logic to iterate valid dates from startDate
    let year = startDate.getFullYear();
    let month = startDate.getMonth();

    let checkDate = getValidDate(year, month, payDay);
    if (checkDate < startDate) {
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      checkDate = getValidDate(year, month, payDay);
    }

    let iterations = 0;
    while (iterations < 100) {
      const yStr = checkDate.getFullYear();
      const mStr = checkDate.getMonth() + 1;
      const dStr = checkDate.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

      const exists = recordMap.has(originId);

      if (exists) {
        if (checkDate > today) paidFutureCount++;
        lastPaidDate = new Date(checkDate);
      } else {
        if (!nextPaymentDate) nextPaymentDate = new Date(checkDate);
        if (checkDate <= today) pendingCount++;
      }

      if (frequency === "ONE_TIME") break;
      // Only stop when we're in the future AND this date is unpaid (gap found)
      if (checkDate > today && !exists && nextPaymentDate) break;

      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;

      checkDate = getValidDate(year, month, payDay);
      iterations++;
    }

    return {
      ...expense,
      amount: Number(expense.amount),
      pendingCount,
      paidFutureCount,
      nextPaymentDate,
      lastPaidDate,
    };
  });

  return { data, nextCursor, hasMore };
}

export async function markFixedExpensePaid(expenseId: number, count: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!Number.isInteger(expenseId) || expenseId <= 0) throw new Error("Invalid expense ID");
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Invalid count");

  // P1: Resolve FIXED_EXPENSES sync rule so @@unique([syncRuleId, originId]) prevents duplicates
  const { ensureDefaultSyncRules } = await import("@/lib/finance-sync-internal");
  await ensureDefaultSyncRules(user.companyId);
  const fixedExpenseRule = await withRetry(() => prisma.financeSyncRule.findFirst({
    where: { companyId: user.companyId, sourceType: "FIXED_EXPENSES", isActive: true },
    select: { id: true },
  }));

  // D-2: Wrap expense lookup + record fetch + createMany in a transaction to prevent race conditions
  await withRetry(() => prisma.$transaction(async (tx) => {
    const expense = await tx.fixedExpense.findFirst({
      where: { id: expenseId, companyId: user.companyId },
    });
    if (!expense) throw new Error("Expense not found");

    const today = new Date();
    const startDate = (expense as any).startDate || expense.createdAt;
    const frequency = expense.frequency;
    const payDay = expense.payDay || startDate.getDate();
    const baseOriginId = `fixed_${expense.id}`;

    let year = startDate.getFullYear();
    let month = startDate.getMonth();

    let checkDate = getValidDate(year, month, payDay);
    if (checkDate < startDate) {
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      checkDate = getValidDate(year, month, payDay);
    }

    // Pre-fetch all existing originIds for this expense to avoid N+1
    const existingRecords = await tx.financeRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        originId: { startsWith: baseOriginId },
      },
      select: { originId: true },
    });
    const existingOriginIds = new Set(existingRecords.map((r) => r.originId));

    const toCreate: Date[] = [];

    // Identify all missing dates and continue for future payments needed
    while (toCreate.length < count) {
      const yStr = checkDate.getFullYear();
      const mStr = checkDate.getMonth() + 1;
      const dStr = checkDate.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

      const exists = existingOriginIds.has(originId);

      if (!exists) {
        toCreate.push(new Date(checkDate));
      }

      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      else if (frequency === "ONE_TIME") {
        break;
      }

      checkDate = getValidDate(year, month, payDay);
    }

    // Create the first N records (oldest first)
    const recordsToCreate = toCreate.slice(0, count);

    const now = new Date();
    const recordsData = recordsToCreate.map((date) => {
      const yStr = date.getFullYear();
      const mStr = date.getMonth() + 1;
      const dStr = date.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;
      return {
        companyId: user.companyId,
        title: expense.title,
        amount: expense.amount,
        type: "EXPENSE" as const,
        category: expense.category || "Fixed Expense",
        date: date,
        status: "COMPLETED" as const,
        description:
          (expense.description || `Fixed Expense: ${frequency}`) +
          (date > now ? " (תשלום עתידי)" : ""),
        originId: originId,
        syncRuleId: fixedExpenseRule?.id ?? null,
      };
    });

    if (recordsData.length > 0) {
      await tx.financeRecord.createMany({ data: recordsData, skipDuplicates: true });
    }
  }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 10000 }));

  // Trigger Auto-Sync (outside transaction to avoid holding locks)
  const { triggerSyncByType } = await import("@/lib/finance-sync-internal");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
  revalidatePath("/finance/income-expenses");
  revalidatePath("/finance");
}

export async function createFixedExpense(data: {
  title: string;
  amount: number;
  frequency: string;
  payDay?: number;
  category?: string;
  description?: string;
  startDate?: Date;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!data.title || typeof data.title !== "string" || data.title.length > 200) {
    throw new Error("Title is required and must be under 200 characters");
  }
  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (!["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"].includes(data.frequency)) {
    throw new Error("Invalid frequency");
  }
  if (data.payDay !== undefined && (!Number.isInteger(data.payDay) || data.payDay < 1 || data.payDay > 31)) {
    throw new Error("payDay must be an integer between 1 and 31");
  }
  if (data.category !== undefined && (typeof data.category !== "string" || data.category.length > 200)) {
    throw new Error("Category must be under 200 characters");
  }
  if (data.description !== undefined && (typeof data.description !== "string" || data.description.length > 5000)) {
    throw new Error("Description must be under 5000 characters");
  }
  if (data.startDate !== undefined && (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime()))) {
    throw new Error("Invalid start date");
  }

  await withRetry(() => prisma.fixedExpense.create({
    data: {
      companyId: user.companyId,
      title: data.title,
      amount: data.amount,
      frequency: data.frequency as any,
      payDay: data.payDay,
      category: data.category,
      description: data.description,
      startDate: data.startDate, // Added Start Date
      status: "ACTIVE",
    },
  }));

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("@/lib/finance-sync-internal");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
  revalidatePath("/finance/income-expenses");
  // await processFixedExpenses(); // Disabled automatic processing
}

export async function updateFixedExpense(
  id: number,
  data: {
    title?: string;
    amount?: number;
    frequency?: string;
    payDay?: number;
    category?: string;
    description?: string;
    startDate?: Date;
    status?: string;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid expense ID");

  if (data.status !== undefined && !VALID_FIXED_EXPENSE_STATUSES.includes(data.status as any)) {
    throw new Error(`Invalid status: ${data.status}`);
  }

  // SECURITY: Whitelist allowed fields to prevent companyId/id injection
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) {
    if (typeof data.title !== "string" || data.title.length > 200) throw new Error("Invalid title");
    updateData.title = data.title;
  }
  if (data.amount !== undefined) {
    if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) throw new Error("Invalid amount");
    updateData.amount = data.amount;
  }
  if (data.frequency !== undefined) {
    if (!["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"].includes(data.frequency)) throw new Error("Invalid frequency");
    updateData.frequency = data.frequency;
  }
  if (data.payDay !== undefined) {
    if (!Number.isInteger(data.payDay) || data.payDay < 1 || data.payDay > 31) throw new Error("Invalid payDay");
    updateData.payDay = data.payDay;
  }
  if (data.category !== undefined) {
    if (typeof data.category !== "string" || data.category.length > 200) throw new Error("Invalid category");
    updateData.category = data.category;
  }
  if (data.description !== undefined) {
    if (typeof data.description !== "string" || data.description.length > 5000) throw new Error("Invalid description");
    updateData.description = data.description;
  }
  if (data.startDate !== undefined) {
    if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) throw new Error("Invalid start date");
    updateData.startDate = data.startDate;
  }
  if (data.status !== undefined) updateData.status = data.status;

  await withRetry(() => prisma.fixedExpense.update({
    where: {
      id,
      companyId: user.companyId,
    },
    data: updateData,
  }));

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("@/lib/finance-sync-internal");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
  revalidatePath("/finance/income-expenses");
}

export async function deleteFixedExpense(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid expense ID");

  await withRetry(() => prisma.fixedExpense.delete({
    where: {
      id,
      companyId: user.companyId,
    },
  }));

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("@/lib/finance-sync-internal");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
}

export async function processFixedExpenses() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  const { processFixedExpensesInternal } = await import("@/lib/finance-sync-internal");
  const count = await processFixedExpensesInternal(user.companyId);

  if (count && count > 0) {
    revalidatePath("/finance/income-expenses");
    revalidatePath("/finance");
  }

  return count;
}
