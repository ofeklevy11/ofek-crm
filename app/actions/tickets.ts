"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { validateUserInCompany, validateClientInCompany } from "@/lib/company-validation";

export async function getTickets() {
  const user = await getCurrentUser();
  if (!user) return [];

  // P104: Removed comments/activityLogs from list query — load on-demand via getTicketDetails()
  return await prisma.ticket.findMany({
    where: {
      companyId: user.companyId,
      status: { not: "CLOSED" },
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true, email: true, company: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true, activityLogs: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500, // P104: Bound ticket list query
  });
}

// On-demand loading of ticket details with comments and activity logs
export async function getTicketDetails(ticketId: number) {
  const user = await getCurrentUser();
  if (!user) return null;

  return await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      companyId: user.companyId,
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
        take: 100,
      },
      activityLogs: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50, // Limit activity logs for performance
      },
    },
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
  slaResponseDueDate?: Date;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Auto-calculate SLA dates if not provided
  let calculatedSlaDueDate = data.slaDueDate;
  let calculatedSlaResponseDueDate = data.slaResponseDueDate;

  if (data.priority) {
    const slaPolicy = await prisma.slaPolicy.findUnique({
      where: {
        companyId_priority: {
          companyId: user.companyId,
          priority: data.priority,
        },
      },
    });

    if (slaPolicy) {
      // Calculate resolve time (slaDueDate)
      if (!calculatedSlaDueDate && slaPolicy.resolveTimeMinutes) {
        calculatedSlaDueDate = new Date(
          Date.now() + slaPolicy.resolveTimeMinutes * 60 * 1000,
        );
        console.log(
          `[SLA] Auto-calculated slaDueDate for priority ${data.priority}: ${calculatedSlaDueDate}`,
        );
      }

      // Calculate response time (slaResponseDueDate)
      if (!calculatedSlaResponseDueDate && slaPolicy.responseTimeMinutes) {
        calculatedSlaResponseDueDate = new Date(
          Date.now() + slaPolicy.responseTimeMinutes * 60 * 1000,
        );
        console.log(
          `[SLA] Auto-calculated slaResponseDueDate for priority ${data.priority}: ${calculatedSlaResponseDueDate}`,
        );
      }
    }
  }

  // SECURITY: Validate cross-company references
  if (data.assigneeId) {
    if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }
  if (data.clientId) {
    if (!(await validateClientInCompany(data.clientId, user.companyId))) {
      throw new Error("Invalid client");
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      ...data,
      slaDueDate: calculatedSlaDueDate,
      slaResponseDueDate: calculatedSlaResponseDueDate,
      companyId: user.companyId,
      creatorId: user.id,
    },
  });

  if (data.assigneeId && data.assigneeId !== user.id) {
    try {
      await inngest.send({
        id: `ticket-notify-assignee-${user.companyId}-${ticket.id}`,
        name: "ticket/notification" as const,
        data: {
          type: "assignee" as const,
          isNew: true,
          companyId: user.companyId,
          assigneeId: data.assigneeId,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
        },
      });
    } catch (error) {
      console.error("[ticket/notification] inngest.send failed:", error);
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
    clientId?: number | null;
    assigneeId?: number;
    tags?: string[];
    slaDueDate?: Date;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const currentTicket = await prisma.ticket.findUnique({
    where: { id, companyId: user.companyId },
    select: {
      status: true,
      title: true,
      priority: true,
      type: true,
      assigneeId: true,
      clientId: true,
      description: true,
      createdAt: true,
    },
  });

  if (!currentTicket) throw new Error("Ticket not found");

  // SECURITY: Validate cross-company references
  if (data.assigneeId) {
    if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }
  if (data.clientId !== undefined && data.clientId !== null) {
    if (!(await validateClientInCompany(data.clientId, user.companyId))) {
      throw new Error("Invalid client");
    }
  }

  // Check if priority is being changed - if so, recalculate SLA dates
  let updateData = { ...data };

  if (data.priority && data.priority !== currentTicket.priority) {
    console.log(
      `[SLA] Priority change detected for ticket ${id}: ${currentTicket.priority} -> ${data.priority}`,
    );

    // Get the SLA policy for the new priority
    const slaPolicy = await prisma.slaPolicy.findUnique({
      where: {
        companyId_priority: {
          companyId: user.companyId,
          priority: data.priority,
        },
      },
    });

    if (slaPolicy) {
      // Calculate new SLA dates based on NOW (current time)
      // This ensures the SLA timing starts fresh from the priority change
      const now = Date.now();

      if (slaPolicy.resolveTimeMinutes) {
        updateData.slaDueDate = new Date(
          now + slaPolicy.resolveTimeMinutes * 60 * 1000,
        );
        console.log(
          `[SLA] Recalculated slaDueDate for new priority ${data.priority}: ${updateData.slaDueDate}`,
        );
      }

      // Also update response due date if the ticket is still OPEN
      const newStatus = data.status || currentTicket.status;
      if (newStatus === "OPEN" && slaPolicy.responseTimeMinutes) {
        (updateData as any).slaResponseDueDate = new Date(
          now + slaPolicy.responseTimeMinutes * 60 * 1000,
        );
        console.log(
          `[SLA] Recalculated slaResponseDueDate for new priority ${
            data.priority
          }: ${(updateData as any).slaResponseDueDate}`,
        );
      }
    } else {
      console.log(
        `[SLA] No SLA policy found for priority ${data.priority}, clearing SLA dates`,
      );
      // If there's no SLA policy for the new priority, clear the SLA dates
      updateData.slaDueDate = undefined;
      (updateData as any).slaResponseDueDate = undefined;
    }
  }

  const ticket = await prisma.ticket.update({
    where: { id, companyId: user.companyId },
    data: updateData,
  });

  // Fire background jobs for activity logs and status change automation
  const events: Parameters<typeof inngest.send>[0] = [];

  events.push({
    id: `ticket-activity-${user.companyId}-${id}-${Math.floor(Date.now() / 1000)}`,
    name: "ticket/activity-log" as const,
    data: {
      ticketId: id,
      userId: user.id,
      companyId: user.companyId,
      previousData: currentTicket,
      newData: data,
    },
  });

  if (data.status && data.status !== currentTicket.status) {
    events.push({
      id: `ticket-status-${user.companyId}-${ticket.id}-${data.status}`,
      name: "ticket/status-change" as const,
      data: {
        ticketId: ticket.id,
        companyId: user.companyId,
        ticketTitle: ticket.title,
        fromStatus: currentTicket.status,
        toStatus: data.status,
      },
    });
  }

  if (data.assigneeId && data.assigneeId !== currentTicket.assigneeId && data.assigneeId !== user.id) {
    events.push({
      id: `ticket-notify-reassign-${user.companyId}-${ticket.id}-${data.assigneeId}`,
      name: "ticket/notification" as const,
      data: {
        type: "assignee" as const,
        isNew: false,
        companyId: user.companyId,
        assigneeId: data.assigneeId,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
      },
    });
  }

  try {
    await inngest.send(events);
  } catch (error) {
    console.error("[updateTicket] inngest.send failed:", error);
  }

  revalidatePath("/service");
  return ticket;
}

export async function addTicketComment(
  ticketId: number,
  content: string,
  isInternal: boolean = false,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify ticket belongs to user's company before creating comment
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, companyId: user.companyId },
    select: { id: true },
  });
  if (!ticket) throw new Error("Unauthorized");

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      userId: user.id,
      content,
      isInternal,
    },
  });

  // Notify assignee in background
  try {
    await inngest.send({
      id: `ticket-notify-comment-${user.companyId}-${ticketId}-${comment.id}`,
      name: "ticket/notification" as const,
      data: {
        type: "comment" as const,
        companyId: user.companyId,
        ticketId,
        userId: user.id,
        userName: user.name,
      },
    });
  } catch (error) {
    console.error("[ticket/notification] inngest.send failed:", error);
  }

  revalidatePath("/service");
  return comment;
}

export async function updateTicketComment(commentId: number, content: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Find the comment and verify permissions
  const comment = await prisma.ticketComment.findFirst({
    where: {
      id: commentId,
      ticket: { companyId: user.companyId },
    },
    include: {
      ticket: { select: { companyId: true } },
    },
  });

  if (!comment) {
    throw new Error("Unauthorized");
  }

  // Only the author or admin can edit
  if (comment.userId !== user.id && user.role !== "admin") {
    throw new Error("רק מי ששלח את ההודעה או מנהל יכול לערוך");
  }

  // SECURITY: Scope update via ticket companyId join to prevent TOCTOU
  await prisma.ticketComment.updateMany({
    where: { id: commentId, ticket: { companyId: user.companyId } },
    data: { content },
  });

  revalidatePath("/service");
}

export async function deleteTicketComment(commentId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Find the comment and verify permissions
  const comment = await prisma.ticketComment.findFirst({
    where: {
      id: commentId,
      ticket: { companyId: user.companyId },
    },
    include: {
      ticket: { select: { companyId: true } },
    },
  });

  if (!comment) {
    throw new Error("Unauthorized");
  }

  // Only the author or admin can delete
  if (comment.userId !== user.id && user.role !== "admin") {
    throw new Error("רק מי ששלח את ההודעה או מנהל יכול למחוק");
  }

  // SECURITY: Scope delete via ticket companyId join to prevent TOCTOU
  await prisma.ticketComment.deleteMany({
    where: { id: commentId, ticket: { companyId: user.companyId } },
  });

  revalidatePath("/service");
}

export async function getSlaPolicies() {
  const user = await getCurrentUser();
  if (!user) return [];

  return await prisma.slaPolicy.findMany({
    where: { companyId: user.companyId },
    take: 50,
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
}

export async function deleteTicket(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify the ticket belongs to the user's company before deleting
  const ticket = await prisma.ticket.findFirst({
    where: { id, companyId: user.companyId },
  });

  if (!ticket) {
    throw new Error("Unauthorized");
  }

  await prisma.ticket.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/service");
}

export async function getTicketStats() {
  const user = await getCurrentUser();
  if (!user)
    return {
      open: 0,
      inProgress: 0,
      waiting: 0,
      closed: 0,
      breached: 0,
    };

  // OPTIMIZED: Use groupBy to get all status counts in a single query
  // instead of 5 separate count queries
  const [statusCounts, breachCount] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { companyId: user.companyId },
      _count: { status: true },
    }),
    prisma.slaBreach.count({
      where: {
        companyId: user.companyId,
        status: "PENDING", // Only uncleared breaches
      },
    }),
  ]);

  // Convert groupBy results to a map for easy lookup
  const countMap: Record<string, number> = {};
  statusCounts.forEach((item) => {
    countMap[item.status] = item._count.status;
  });

  return {
    open: countMap["OPEN"] || 0,
    inProgress: countMap["IN_PROGRESS"] || 0,
    waiting: countMap["WAITING"] || 0,
    closed: countMap["CLOSED"] || 0,
    breached: breachCount,
  };
}

