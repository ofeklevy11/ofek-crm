"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getClosedTickets() {
  const user = await getCurrentUser();
  if (!user) return [];

  return await prisma.ticket.findMany({
    where: {
      companyId: user.companyId,
      status: "CLOSED",
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true, email: true, company: true } },
      creator: { select: { id: true, name: true } },
      comments: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      activityLogs: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function restoreTicket(id: number, newStatus: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Valid statuses to restore to
  const validStatuses = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { companyId: true, status: true },
  });

  if (!ticket || ticket.companyId !== user.companyId) {
    throw new Error("Unauthorized");
  }

  const oldStatus = ticket.status;

  await prisma.ticket.update({
    where: { id },
    data: { status: newStatus },
  });

  // Log the restore action
  const statusLabels: Record<string, string> = {
    OPEN: "פתוח",
    IN_PROGRESS: "בטיפול",
    WAITING: "ממתין",
    RESOLVED: "טופל",
    CLOSED: "סגור",
  };

  await prisma.ticketActivityLog.create({
    data: {
      ticketId: id,
      userId: user.id,
      fieldName: "status",
      fieldLabel: "סטטוס",
      oldValue: oldStatus,
      newValue: newStatus,
      oldLabel: statusLabels[oldStatus] || oldStatus,
      newLabel: statusLabels[newStatus] || newStatus,
    },
  });

  revalidatePath("/service");
  revalidatePath("/service/archive");
}

export async function permanentlyDeleteTicket(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
  });

  if (!ticket || ticket.companyId !== user.companyId) {
    throw new Error("Unauthorized");
  }

  // Delete related activity logs first
  await prisma.ticketActivityLog.deleteMany({
    where: { ticketId: id },
  });

  // Delete related comments
  await prisma.ticketComment.deleteMany({
    where: { ticketId: id },
  });

  // Then delete the ticket
  await prisma.ticket.delete({
    where: { id },
  });

  revalidatePath("/service");
  revalidatePath("/service/archive");
}
