"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/app/actions/notifications";

export async function getTickets() {
  const user = await getCurrentUser();
  if (!user) return [];

  return await prisma.ticket.findMany({
    where: { companyId: user.companyId },
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
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createTicket(data: {
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  clientId?: number;
  assigneeId?: number;
  tags?: string[];
  slaDueDate?: Date;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const ticket = await prisma.ticket.create({
    data: {
      ...data,
      companyId: user.companyId,
      creatorId: user.id,
    },
  });

  if (data.assigneeId) {
    console.log(
      `Creating notification for ticket assignment: Ticket #${ticket.id} to user ${data.assigneeId}`
    );
    try {
      await createNotification({
        userId: data.assigneeId,
        title: "New Ticket Assigned",
        message: `You have been assigned to ticket #${ticket.id}: ${ticket.title}`,
        link: `/service`,
      });
    } catch (error) {
      console.error("Failed to create notification:", error);
    }
  }

  revalidatePath("/service");
  return ticket;
}

export async function updateTicket(
  id: number,
  data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    type?: string;
    clientId?: number;
    assigneeId?: number;
    tags?: string[];
    slaDueDate?: Date;
  }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const ticket = await prisma.ticket.update({
    where: { id, companyId: user.companyId },
    data,
  });

  if (data.assigneeId) {
    console.log(
      `Creating notification for ticket update: Ticket #${ticket.id} to user ${data.assigneeId}`
    );
    await createNotification({
      userId: data.assigneeId,
      title: "Ticket Assigned to You",
      message: `You have been assigned to ticket #${ticket.id}: ${ticket.title}`,
      link: `/service`,
    });
  }

  revalidatePath("/service");
  return ticket;
}

export async function addTicketComment(
  ticketId: number,
  content: string,
  isInternal: boolean = false
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      userId: user.id,
      content,
      isInternal,
    },
  });

  // Notify Assignee if it's not the one commenting
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { assigneeId: true, title: true, id: true },
  });

  if (ticket && ticket.assigneeId) {
    console.log(
      `Creating notification for comment: Ticket #${ticket.id} to user ${ticket.assigneeId}`
    );
    await createNotification({
      userId: ticket.assigneeId,
      title: "New Comment on Ticket",
      message: `${user.name} commented on ticket #${ticket.id}: ${ticket.title}`,
      link: `/service`,
    });
  }

  revalidatePath("/service");
  return comment;
}

export async function getSlaPolicies() {
  const user = await getCurrentUser();
  if (!user) return [];

  return await prisma.slaPolicy.findMany({
    where: { companyId: user.companyId },
  });
}

export async function updateSlaPolicy(data: {
  priority: string;
  responseTimeMinutes: number;
  resolveTimeMinutes: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const policy = await prisma.slaPolicy.upsert({
    where: {
      companyId_priority: {
        companyId: user.companyId,
        priority: data.priority,
      },
    },
    update: {
      responseTimeMinutes: data.responseTimeMinutes,
      resolveTimeMinutes: data.resolveTimeMinutes,
    },
    create: {
      companyId: user.companyId,
      priority: data.priority,
      name: `${data.priority} Policy`,
      responseTimeMinutes: data.responseTimeMinutes,
      resolveTimeMinutes: data.resolveTimeMinutes,
    },
  });

  revalidatePath("/service");
  return policy;
  revalidatePath("/service");
  return policy;
}

export async function deleteTicket(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify the ticket belongs to the user's company before deleting
  const ticket = await prisma.ticket.findUnique({
    where: { id },
  });

  if (!ticket || ticket.companyId !== user.companyId) {
    throw new Error("Unauthorized");
  }

  await prisma.ticket.delete({
    where: { id },
  });

  revalidatePath("/service");
}
