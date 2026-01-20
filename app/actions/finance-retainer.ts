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

  const retainer = await prisma.retainer.findUnique({
    where: { id: retainerId },
    include: { client: true },
  });

  if (!retainer || retainer.client.companyId !== user.companyId) {
    throw new Error("Retainer not found");
  }

  // Determine starting date
  let nextDate = retainer.nextDueDate
    ? new Date(retainer.nextDueDate)
    : new Date();

  // Create payments in loop
  const createdPaymentIds: number[] = [];

  for (let i = 0; i < count; i++) {
    // Current payment due is `nextDate`

    const dueDate = new Date(nextDate);

    const payment = await prisma.oneTimePayment.create({
      data: {
        title: `תשלום ריטיינר: ${retainer.title} (${i + 1}/${count})`,
        clientId: retainer.clientId,
        amount: retainer.amount,
        dueDate: dueDate,
        paidDate: dueDate, // Use dueDate as paidDate so it appears in the future logic
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

  // Update retainer with final next date
  await prisma.retainer.update({
    where: { id: retainerId },
    data: {
      nextDueDate: nextDate,
    },
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
