"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

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

  // Serialize Decimal
  return expenses.map((expense: any) => ({
    ...expense,
    amount: Number(expense.amount),
  }));
}

export async function createFixedExpense(data: {
  title: string;
  amount: number;
  frequency: string;
  payDay?: number;
  category?: string;
  description?: string;
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
      status: "ACTIVE",
    },
  });

  revalidatePath("/finance/fixed-expenses");
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
    status?: string;
  }
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

  revalidatePath("/finance/fixed-expenses");
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

  revalidatePath("/finance/fixed-expenses");
}
