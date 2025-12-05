"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ==================== RETAINERS ====================

export async function getRetainers() {
  try {
    const retainers = await prisma.retainer.findMany({
      include: {
        client: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: retainers };
  } catch (error) {
    console.error("Error fetching retainers:", error);
    return { success: false, error: "Failed to fetch retainers" };
  }
}

export async function getRetainerById(id: number) {
  try {
    const retainer = await prisma.retainer.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!retainer) {
      return { success: false, error: "Retainer not found" };
    }

    return { success: true, data: retainer };
  } catch (error) {
    console.error("Error fetching retainer:", error);
    return { success: false, error: "Failed to fetch retainer" };
  }
}

export async function createRetainer(data: {
  title: string;
  clientId: number;
  amount: number;
  frequency: string;
  startDate: string;
  notes?: string;
}) {
  try {
    const { title, clientId, amount, frequency, startDate, notes } = data;

    // Calculate next due date based on frequency
    const start = new Date(startDate);
    const nextDueDate = new Date(start);

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

    const retainer = await prisma.retainer.create({
      data: {
        title,
        clientId: parseInt(String(clientId)),
        amount,
        frequency,
        startDate: start,
        nextDueDate,
        status: "active",
        notes,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return { success: true, data: retainer };
  } catch (error) {
    console.error("Error creating retainer:", error);
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
  }
) {
  try {
    const updateData: Record<string, unknown> = { ...data };

    if (data.nextDueDate) {
      updateData.nextDueDate = new Date(data.nextDueDate);
    }

    const retainer = await prisma.retainer.update({
      where: { id },
      data: updateData,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return { success: true, data: retainer };
  } catch (error) {
    console.error("Error updating retainer:", error);
    return { success: false, error: "Failed to update retainer" };
  }
}

export async function deleteRetainer(id: number) {
  try {
    await prisma.retainer.delete({
      where: { id },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/retainers");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting retainer:", error);
    return { success: false, error: "Failed to delete retainer" };
  }
}

// ==================== PAYMENTS ====================

export async function getPayments() {
  try {
    const payments = await prisma.oneTimePayment.findMany({
      include: {
        client: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: payments };
  } catch (error) {
    console.error("Error fetching payments:", error);
    return { success: false, error: "Failed to fetch payments" };
  }
}

export async function getPaymentById(id: number) {
  try {
    const payment = await prisma.oneTimePayment.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    return { success: true, data: payment };
  } catch (error) {
    console.error("Error fetching payment:", error);
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
    const { title, clientId, amount, dueDate, notes } = data;

    const payment = await prisma.oneTimePayment.create({
      data: {
        title,
        clientId: parseInt(String(clientId)),
        amount,
        dueDate: new Date(dueDate),
        status: "pending",
        notes,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/");

    return { success: true, data: payment };
  } catch (error) {
    console.error("Error creating payment:", error);
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
  }
) {
  try {
    const updateData: Record<string, unknown> = { ...data };

    if (data.dueDate) {
      updateData.dueDate = new Date(data.dueDate);
    }

    const payment = await prisma.oneTimePayment.update({
      where: { id },
      data: updateData,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/");

    return { success: true, data: payment };
  } catch (error) {
    console.error("Error updating payment:", error);
    return { success: false, error: "Failed to update payment" };
  }
}

export async function deletePayment(id: number) {
  try {
    await prisma.oneTimePayment.delete({
      where: { id },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/payments");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting payment:", error);
    return { success: false, error: "Failed to delete payment" };
  }
}

// ==================== CLIENT SEARCH ====================

export async function searchClients(searchTerm: string) {
  try {
    // This assumes you have a Client model in your Prisma schema
    // Adjust the search logic based on your actual schema
    const records = await prisma.record.findMany({
      where: {
        tableId: 2, // Assuming table ID 2 is for clients - adjust as needed
      },
    });

    const filteredRecords = records.filter((record) => {
      const dataStr = JSON.stringify(record.data).toLowerCase();
      return dataStr.includes(searchTerm.toLowerCase());
    });

    return { success: true, data: filteredRecords };
  } catch (error) {
    console.error("Error searching clients:", error);
    return { success: false, error: "Failed to search clients" };
  }
}

export async function getFinanceClients() {
  try {
    const clients = await prisma.record.findMany({
      where: {
        tableId: 2, // Assuming table ID 2 is for clients - adjust as needed
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: clients };
  } catch (error) {
    console.error("Error fetching finance clients:", error);
    return { success: false, error: "Failed to fetch finance clients" };
  }
}
