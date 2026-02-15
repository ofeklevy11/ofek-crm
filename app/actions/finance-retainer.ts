"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { withRetry } from "@/lib/db-retry";

export async function markRetainerAsPaid(
  retainerId: number,
  count: number = 1,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (count < 1 || count > 100) throw new Error("Invalid count");

  await withRetry(() => prisma.$transaction(async (tx) => {
    const retainer = await tx.retainer.findFirst({
      where: { id: retainerId, companyId: user.companyId, deletedAt: null },
      select: { id: true, title: true, clientId: true, amount: true, frequency: true, nextDueDate: true },
    });

    if (!retainer) {
      throw new Error("Retainer not found");
    }

    // Build all payment records, advancing the date for each
    let nextDate = retainer.nextDueDate
      ? new Date(retainer.nextDueDate)
      : new Date();

    const paymentsData: {
      title: string; clientId: number; companyId: number; amount: typeof retainer.amount;
      dueDate: Date; paidDate: Date; status: string; notes: string;
    }[] = [];
    for (let i = 0; i < count; i++) {
      const dueDate = new Date(nextDate);
      paymentsData.push({
        title: `תשלום ריטיינר: ${retainer.title} (${i + 1}/${count})`,
        clientId: retainer.clientId,
        companyId: user.companyId,
        amount: retainer.amount,
        dueDate,
        paidDate: dueDate,
        status: "paid",
        notes: `נוצר אוטומטית מריטיינר #${retainer.id} (תשלום ${i + 1} מתוך ${count})`,
      });

      switch (retainer.frequency) {
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case "quarterly":
          nextDate.setMonth(nextDate.getMonth() + 3);
          break;
        case "annually":
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }
    }

    // Batch create all payments in one statement
    await tx.oneTimePayment.createMany({ data: paymentsData });

    // Update retainer with final next date
    await tx.retainer.updateMany({
      where: { id: retainerId, companyId: user.companyId, deletedAt: null },
      data: { nextDueDate: nextDate },
    });
  }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 10000 }));

  // Trigger Sync Rules
  try {
    const { triggerSyncByType } = await import("./finance-sync");
    await triggerSyncByType(user.companyId, "PAYMENTS_RETAINERS");
  } catch (e) {
    console.error("Failed to trigger sync from retainer payment", e);
  }

  revalidatePath("/finance/retainers");
  revalidatePath("/finance/payments");
  revalidatePath("/finance/income-expenses");

  return { success: true, count };
}
