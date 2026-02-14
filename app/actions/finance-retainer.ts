"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function markRetainerAsPaid(
  retainerId: number,
  count: number = 1,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (count < 1 || count > 100) throw new Error("Invalid count");

  const createdPaymentIds: number[] = [];

  await prisma.$transaction(async (tx) => {
    const retainer = await tx.retainer.findFirst({
      where: { id: retainerId, client: { companyId: user.companyId } },
      include: { client: true },
    });

    if (!retainer) {
      throw new Error("Retainer not found");
    }

    // Determine starting date
    let nextDate = retainer.nextDueDate
      ? new Date(retainer.nextDueDate)
      : new Date();

    // Create payments in loop
    for (let i = 0; i < count; i++) {
      const dueDate = new Date(nextDate);

      const payment = await tx.oneTimePayment.create({
        data: {
          title: `תשלום ריטיינר: ${retainer.title} (${i + 1}/${count})`,
          clientId: retainer.clientId,
          amount: retainer.amount,
          dueDate: dueDate,
          paidDate: dueDate,
          status: "paid",
          notes: `נוצר אוטומטית מריטיינר #${retainer.id} (תשלום ${
            i + 1
          } מתוך ${count})`,
        },
      });
      createdPaymentIds.push(payment.id);

      // Advance date for next iteration/update
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

    // Update retainer with final next date (inside same transaction)
    await tx.retainer.updateMany({
      where: { id: retainerId, client: { companyId: user.companyId } },
      data: {
        nextDueDate: nextDate,
      },
    });
  });

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

  return { success: true, count, paymentIds: createdPaymentIds };
}
