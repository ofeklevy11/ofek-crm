"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getClosedTickets() {
  const user = await getCurrentUser();
  if (!user) return [];

  // P105: Removed comments/activityLogs from list query — load on-demand via getTicketDetails()
  return await prisma.ticket.findMany({
    where: {
      companyId: user.companyId,
      status: "CLOSED",
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true, email: true, company: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true, activityLogs: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500, // P105: Bound closed ticket list query
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

  const ticket = await prisma.ticket.findFirst({
    where: { id, companyId: user.companyId },
    select: { companyId: true, status: true },
  });

  if (!ticket) {
    throw new Error("Unauthorized");
  }

  const oldStatus = ticket.status;

  await prisma.ticket.update({
    where: { id, companyId: user.companyId },
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

  const ticket = await prisma.ticket.findFirst({
    where: { id, companyId: user.companyId },
  });

  if (!ticket) {
    throw new Error("Unauthorized");
  }

  await prisma.$transaction([
    // SECURITY: Add relation filter to ensure ticket belongs to user's company
    prisma.ticketActivityLog.deleteMany({ where: { ticketId: id, ticket: { companyId: user.companyId } } }),
    prisma.ticketComment.deleteMany({ where: { ticketId: id, ticket: { companyId: user.companyId } } }),
    prisma.ticket.delete({ where: { id, companyId: user.companyId } }),
  ]);

  revalidatePath("/service");
  revalidatePath("/service/archive");
}
