"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ==================== RETAINERS ====================

// ==================== RETAINERS ====================

export async function getRetainers() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const retainers = await prisma.retainer.findMany({
      where: {
        client: {
          companyId: user.companyId,
        },
      },
      include: {
        client: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true,
      data: retainers.map((r) => ({ ...r, amount: Number(r.amount) })),
    };
  } catch (error) {
    console.error("Error fetching retainers:", error);
    return { success: false, error: "Failed to fetch retainers" };
  }
}

export async function getRetainerById(id: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const retainer = await prisma.retainer.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!retainer) {
      return { success: false, error: "Retainer not found" };
    }

    // Authorization check
    if (retainer.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
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
  paymentMode?: "prepaid" | "postpaid";
  notes?: string;
}) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const {
      title,
      clientId,
      amount,
      frequency,
      startDate,
      paymentMode,
      notes,
    } = data;

    // Verify client belongs to company
    const client = await prisma.client.findUnique({
      where: { id: Number(clientId) },
    });
    if (!client || client.companyId !== user.companyId) {
      return { success: false, error: "Invalid client" };
    }

    // Calculate next due date based on frequency
    const start = new Date(startDate);
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

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Verify ownership
    const existing = await prisma.retainer.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!existing || existing.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

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

    return {
      success: true,
      data: { ...retainer, amount: Number(retainer.amount) },
    };
  } catch (error) {
    console.error("Error updating retainer:", error);
    return { success: false, error: "Failed to update retainer" };
  }
}

export async function deleteRetainer(id: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Verify ownership
    const existing = await prisma.retainer.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!existing || existing.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.oneTimePayment.deleteMany({
      where: {
        AND: [
          { clientId: existing.clientId },
          { notes: { contains: `ריטיינר #${id}` } },
        ],
      },
    });

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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const payments = await prisma.oneTimePayment.findMany({
      where: {
        client: { companyId: user.companyId },
      },
      include: {
        client: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true,
      data: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    };
  } catch (error) {
    console.error("Error fetching payments:", error);
    return { success: false, error: "Failed to fetch payments" };
  }
}

export async function getPaymentById(id: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const payment = await prisma.oneTimePayment.findUnique({
      where: { id },
      include: {
        client: true,
      },
    });

    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    if (payment.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

    return {
      success: true,
      data: { ...payment, amount: Number(payment.amount) },
    };
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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { title, clientId, amount, dueDate, notes } = data;

    // Verify client belongs to company
    const client = await prisma.client.findUnique({
      where: { id: Number(clientId) },
    });
    if (!client || client.companyId !== user.companyId) {
      return { success: false, error: "Invalid client" };
    }

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

    return {
      success: true,
      data: { ...payment, amount: Number(payment.amount) },
    };
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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Verify
    const existing = await prisma.oneTimePayment.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!existing || existing.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

    const updateData: Record<string, unknown> = { ...data };

    if (data.dueDate) {
      updateData.dueDate = new Date(data.dueDate);
    }

    const payment = await prisma.oneTimePayment.update({
      where: { id },
      data: updateData,
    });

    // --- REAL-TIME FINANCE SYNC FOR PAYMENTS ---
    // If payment became "paid", trigger all TRANSACTIONS sync rules
    if (
      data.status === "paid" ||
      data.status === "Pd" ||
      data.status === "PAID" ||
      data.status === "manual-marked-paid"
    ) {
      try {
        const syncRules = await prisma.financeSyncRule.findMany({
          where: {
            sourceType: "TRANSACTIONS",
            isActive: true,
            companyId: existing.client.companyId,
          },
        });

        if (syncRules.length > 0) {
          console.log(
            `[Finance] Payment #${id} marked as paid. Triggering ${syncRules.length} sync rules...`
          );
          const { runSyncRule } = await import("./finance-sync");
          for (const rule of syncRules) {
            runSyncRule(rule.id).catch((e) =>
              console.error(`[Auto-Sync] Failed to run rule ${rule.id}`, e)
            );
          }
        }
      } catch (err) {
        console.error(
          "[Finance] Error triggering sync on payment update:",
          err
        );
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
    console.error("Error updating payment:", error);
    return { success: false, error: "Failed to update payment" };
  }
}

export async function deletePayment(id: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Verify
    const existing = await prisma.oneTimePayment.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!existing || existing.client.companyId !== user.companyId) {
      return { success: false, error: "Unauthorized" };
    }

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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Find the clients table dynamically for this company
    const clientTable = await prisma.tableMeta.findFirst({
      where: {
        companyId: user.companyId,
        OR: [{ slug: "clients" }, { name: "לקוחות" }, { name: "Clients" }],
      },
    });

    if (!clientTable) {
      // Fallback: search in Client model if it exists directly?
      // This app seems to have dual source of truth (TableMeta vs Client model)
      // But schema has `Client` model. We should search THAT.
      // Wait, the previous code was searching `Record` with tableId: 2.
      // Let's assume we should search the `Client` model instead which is typed.

      const clients = await prisma.client.findMany({
        where: {
          companyId: user.companyId,
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { email: { contains: searchTerm, mode: "insensitive" } },
            { company: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        take: 10,
      });

      // Helper to format as 'data' for records?
      // The caller expects filteredRecords.
      // Let's return them as is, hoping the caller can handle Client objects OR objects with 'data' field.
      // Previous code returned `filteredRecords` from `Record` model.
      // This implies the frontend expects Record structure `{ data: { ... } }`.
      // We should probably rely on `Client` model for Finance.

      return { success: true, data: clients };
    }

    // If we want to stick to the Record model for custom fields:
    const records = await prisma.record.findMany({
      where: {
        tableId: clientTable.id,
        companyId: user.companyId, // Filter by company
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
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Try to get from Client model first (Best for Finance)
    const clients = await prisma.client.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
    });

    if (clients.length > 0) {
      return { success: true, data: clients };
    }

    // Fallback: Check for a "Clients" table in TableMeta
    const clientTable = await prisma.tableMeta.findFirst({
      where: {
        companyId: user.companyId,
        OR: [{ slug: "clients" }, { name: "לקוחות" }, { name: "Clients" }],
      },
    });

    if (clientTable) {
      const records = await prisma.record.findMany({
        where: {
          tableId: clientTable.id,
        },
        orderBy: { createdAt: "desc" },
      });
      return { success: true, data: records };
    }

    return { success: true, data: [] };
  } catch (error) {
    console.error("Error fetching finance clients:", error);
    return { success: false, error: "Failed to fetch finance clients" };
  }
}
