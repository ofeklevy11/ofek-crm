"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

// Helper to get clamped date
const getValidDate = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d);
  // Check overflow (e.g. Feb 30 -> Mar 2)
  if (date.getMonth() !== ((m % 12) + 12) % 12) {
    return new Date(y, m + 1, 0); // Last day of intended month
  }
  return date;
};

export async function getFixedExpenses() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const expenses = await prisma.fixedExpense.findMany({
    where: {
      companyId: user.companyId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Fetch all finance records related to fixed expenses to calculate status
  // We assume originId starts with "fixed_{id}"
  const financeRecords = await prisma.financeRecord.findMany({
    where: {
      companyId: user.companyId,
      originId: {
        startsWith: "fixed_",
      },
    },
    select: {
      originId: true,
      date: true,
    },
  });

  const recordMap = new Set(financeRecords.map((r) => r.originId));
  const today = new Date();

  // Enhance expenses with status
  return expenses.map((expense: any) => {
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
    // Look ahead up to 50 cycles or until we find the next due date in the future
    while (iterations < 100) {
      const yStr = checkDate.getFullYear();
      const mStr = checkDate.getMonth() + 1;
      const dStr = checkDate.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

      const exists = recordMap.has(originId);

      if (exists) {
        if (checkDate > today) {
          paidFutureCount++;
        }
        lastPaidDate = new Date(checkDate);
      } else {
        // This record is missing
        if (!nextPaymentDate) {
          nextPaymentDate = new Date(checkDate);
        }

        if (checkDate <= today) {
          pendingCount++;
        } else {
          // Future gap found - we can stop looking for "Paid Future" usually,
          // assuming contiguous payments. But let's continue a bit to be safe?
          // Actually, usually we stop counting "Paid Ahead" once we find a gap?
          // No, let's just count all Paid Future found in the loop range.
          // But we should stop the loop eventually.
          // If we found nextPaymentDate AND we are in the future, we can probably stop shortly.
        }
      }

      // Stop condition: We are in the future AND we found the next payment date AND we haven't found a paid record for a while?
      // Simpler: Just run for a fixed horizon from 'today' if we enter future?
      // Or just run 100 iterations from start.
      // If we are far in the future (e.g. > today + 2 years) and haven't found a paid record, break.
      if (
        checkDate > today &&
        !exists &&
        (!nextPaymentDate || checkDate.getTime() > nextPaymentDate.getTime())
      ) {
        // If we passed the next payment date and still valid, break relative early
        if (checkDate.getFullYear() > today.getFullYear() + 2) break;
      }

      // Advance
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      else if (frequency === "ONE_TIME") {
        // One time check
        break;
      }

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
}

export async function markFixedExpensePaid(expenseId: number, count: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const expense = await prisma.fixedExpense.findFirst({
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

  const toCreate: Date[] = [];

  // Identify all missing dates
  // Identify all missing dates and continue for future payments needed
  while (toCreate.length < count) {
    // Logic Change: Keep going until we match the count
    const yStr = checkDate.getFullYear();
    const mStr = checkDate.getMonth() + 1;
    const dStr = checkDate.getDate();
    const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

    const exists = await prisma.financeRecord.findFirst({
      where: {
        companyId: user.companyId,
        originId: originId,
      },
      select: { id: true },
    });

    if (!exists) {
      toCreate.push(new Date(checkDate));
    }

    if (frequency === "MONTHLY") month++;
    else if (frequency === "QUARTERLY") month += 3;
    else if (frequency === "YEARLY") year++;
    else if (frequency === "ONE_TIME") {
      if (toCreate.length < count && !exists) {
        // If one time and we already processed it (or added it), stop.
        // Actually for one time, we should probably stop after 1.
        checkDate = new Date(
          checkDate.setFullYear(checkDate.getFullYear() + 100),
        ); // Force exit
        break;
      }
      break;
    }

    checkDate = getValidDate(year, month, payDay);
  }

  // Create the first N records (oldest first)
  const recordsToCreate = toCreate.slice(0, count);

  for (const date of recordsToCreate) {
    const yStr = date.getFullYear();
    const mStr = date.getMonth() + 1;
    const dStr = date.getDate();
    const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

    await prisma.financeRecord.create({
      data: {
        companyId: user.companyId,
        title: expense.title,
        amount: expense.amount,
        type: "EXPENSE",
        category: expense.category || "Fixed Expense",
        date: date,
        status: "COMPLETED",
        description:
          (expense.description || `Fixed Expense: ${frequency}`) +
          (date > new Date() ? " (תשלום עתידי)" : ""),
        originId: originId,
      },
    });
  }

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("./finance-sync");
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

  await prisma.fixedExpense.create({
    data: {
      companyId: user.companyId,
      title: data.title,
      amount: data.amount,
      frequency: data.frequency,
      payDay: data.payDay,
      category: data.category,
      description: data.description,
      startDate: data.startDate, // Added Start Date
      status: "ACTIVE",
    },
  });

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("./finance-sync");
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

  await prisma.fixedExpense.update({
    where: {
      id,
      companyId: user.companyId,
    },
    data,
  });

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("./finance-sync");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
  revalidatePath("/finance/income-expenses");
  // await processFixedExpenses(); // Disabled automatic processing
}

export async function deleteFixedExpense(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.fixedExpense.delete({
    where: {
      id,
      companyId: user.companyId,
    },
  });

  // Trigger Auto-Sync
  const { triggerSyncByType } = await import("./finance-sync");
  await triggerSyncByType(user.companyId, "FIXED_EXPENSES");

  revalidatePath("/finance/fixed-expenses");
}

export async function processFixedExpenses() {
  const user = await getCurrentUser();
  if (!user) return;

  const expenses = await prisma.fixedExpense.findMany({
    where: {
      companyId: user.companyId,
      status: "ACTIVE",
    },
  });

  const today = new Date();
  let createdCount = 0;

  for (const expense of expenses) {
    const startDate = expense.createdAt;
    const frequency = expense.frequency;
    const payDay = expense.payDay || startDate.getDate();
    const baseOriginId = `fixed_${expense.id}`;

    // Logic to iterate valid dates from startDate to today
    let year = startDate.getFullYear();
    let month = startDate.getMonth(); // 0-based

    // Helper to get clamped date
    const getValidDate = (y: number, m: number, d: number) => {
      const date = new Date(y, m, d);
      // Check overflow (e.g. Feb 30 -> Mar 2)
      if (date.getMonth() !== ((m % 12) + 12) % 12) {
        return new Date(y, m + 1, 0); // Last day of intended month
      }
      return date;
    };

    // Calculate first potential date
    let checkDate = getValidDate(year, month, payDay);

    // If the first calculated date is strictly before the creation date (ignoring time), skip to next period
    // We compare start of days to be loose, or precise?
    // Let's use precise: if checkDate < startDate, we assume that cycle passed before creation.
    if (checkDate < startDate) {
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;
      checkDate = getValidDate(year, month, payDay);
    }

    while (checkDate <= today) {
      // Create Record
      // Unique ID needs to be specific to the day to allow for rescheduling/precision
      const yStr = checkDate.getFullYear();
      const mStr = checkDate.getMonth() + 1;
      const dStr = checkDate.getDate();
      const originId = `${baseOriginId}_${yStr}_${mStr}_${dStr}`;

      const exists = await prisma.financeRecord.findFirst({
        where: {
          companyId: user.companyId,
          originId: originId,
        },
      });

      if (!exists) {
        await prisma.financeRecord.create({
          data: {
            companyId: user.companyId,
            title: expense.title,
            amount: expense.amount,
            type: "EXPENSE",
            category: expense.category || "Fixed Expense",
            date: checkDate,
            status: "COMPLETED",
            description: expense.description || `Fixed Expense: ${frequency}`,
            originId: originId,
          },
        });
        createdCount++;
      }

      // Advance
      if (frequency === "MONTHLY") month++;
      else if (frequency === "QUARTERLY") month += 3;
      else if (frequency === "YEARLY") year++;

      checkDate = getValidDate(year, month, payDay);
    }
  }

  if (createdCount > 0) {
    revalidatePath("/finance/income-expenses");
    revalidatePath("/finance");
  }

  return createdCount;
}
