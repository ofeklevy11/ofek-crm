"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import {
  createNotification,
  createNotificationForCompany,
} from "@/app/actions/notifications";
import { createTicketActivityLogs } from "@/app/actions/ticket-activity-logs";

export async function getTickets() {
  const user = await getCurrentUser();
  if (!user) return [];

  return await prisma.ticket.findMany({
    where: {
      companyId: user.companyId,
      status: { not: "CLOSED" }, // Exclude closed tickets - they appear in archive
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
          Date.now() + slaPolicy.resolveTimeMinutes * 60 * 1000
        );
        console.log(
          `[SLA] Auto-calculated slaDueDate for priority ${data.priority}: ${calculatedSlaDueDate}`
        );
      }

      // Calculate response time (slaResponseDueDate)
      if (!calculatedSlaResponseDueDate && slaPolicy.responseTimeMinutes) {
        calculatedSlaResponseDueDate = new Date(
          Date.now() + slaPolicy.responseTimeMinutes * 60 * 1000
        );
        console.log(
          `[SLA] Auto-calculated slaResponseDueDate for priority ${data.priority}: ${calculatedSlaResponseDueDate}`
        );
      }
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

  if (data.assigneeId) {
    console.log(
      `Creating notification for ticket assignment: Ticket #${ticket.id} to user ${data.assigneeId}`
    );
    try {
      await createNotification({
        userId: data.assigneeId,
        title: "קריאה חדשה הוקצתה לך",
        message: `הוקצית לקריאה #${ticket.id}: ${ticket.title}`,
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
    clientId?: number | null;
    assigneeId?: number;
    tags?: string[];
    slaDueDate?: Date;
  }
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

  // Check if priority is being changed - if so, recalculate SLA dates
  let updateData = { ...data };

  if (data.priority && data.priority !== currentTicket.priority) {
    console.log(
      `[SLA] Priority change detected for ticket ${id}: ${currentTicket.priority} -> ${data.priority}`
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
          now + slaPolicy.resolveTimeMinutes * 60 * 1000
        );
        console.log(
          `[SLA] Recalculated slaDueDate for new priority ${data.priority}: ${updateData.slaDueDate}`
        );
      }

      // Also update response due date if the ticket is still OPEN
      const newStatus = data.status || currentTicket.status;
      if (newStatus === "OPEN" && slaPolicy.responseTimeMinutes) {
        (updateData as any).slaResponseDueDate = new Date(
          now + slaPolicy.responseTimeMinutes * 60 * 1000
        );
        console.log(
          `[SLA] Recalculated slaResponseDueDate for new priority ${
            data.priority
          }: ${(updateData as any).slaResponseDueDate}`
        );
      }
    } else {
      console.log(
        `[SLA] No SLA policy found for priority ${data.priority}, clearing SLA dates`
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

  // Create activity logs for tracked changes
  try {
    await createTicketActivityLogs(id, user.id, currentTicket, data);
  } catch (e) {
    console.error("Failed to create ticket activity logs", e);
  }

  if (currentTicket && data.status && data.status !== currentTicket.status) {
    processTicketStatusChange(
      ticket.id,
      user.companyId,
      ticket.title,
      currentTicket.status,
      data.status
    ).catch((e) =>
      console.error("Failed to process ticket status automation", e)
    );
  }

  if (data.assigneeId) {
    console.log(
      `Creating notification for ticket update: Ticket #${ticket.id} to user ${data.assigneeId}`
    );
    await createNotification({
      userId: data.assigneeId,
      title: "קריאה הוקצתה לך",
      message: `הוקצתה לך קריאה #${ticket.id}: ${ticket.title}`,
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
      title: "תגובה חדשה בקריאה",
      message: `${user.name} הגיב בקריאה #${ticket.id}: ${ticket.title}`,
      link: `/service`,
    });
  }

  revalidatePath("/service");
  return comment;
}

export async function updateTicketComment(commentId: number, content: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Find the comment and verify permissions
  const comment = await prisma.ticketComment.findUnique({
    where: { id: commentId },
    include: {
      ticket: { select: { companyId: true } },
    },
  });

  if (!comment || comment.ticket.companyId !== user.companyId) {
    throw new Error("Unauthorized");
  }

  // Only the author or admin can edit
  if (comment.userId !== user.id && user.role !== "admin") {
    throw new Error("רק מי ששלח את ההודעה או מנהל יכול לערוך");
  }

  await prisma.ticketComment.update({
    where: { id: commentId },
    data: { content },
  });

  revalidatePath("/service");
}

export async function deleteTicketComment(commentId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Find the comment and verify permissions
  const comment = await prisma.ticketComment.findUnique({
    where: { id: commentId },
    include: {
      ticket: { select: { companyId: true } },
    },
  });

  if (!comment || comment.ticket.companyId !== user.companyId) {
    throw new Error("Unauthorized");
  }

  // Only the author or admin can delete
  if (comment.userId !== user.id && user.role !== "admin") {
    throw new Error("רק מי ששלח את ההודעה או מנהל יכול למחוק");
  }

  await prisma.ticketComment.delete({
    where: { id: commentId },
  });

  revalidatePath("/service");
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

// Helper to translate ticket statuses to Hebrew
function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    OPEN: "פתוח",
    IN_PROGRESS: "בטיפול",
    WAITING: "ממתין",
    RESOLVED: "טופל",
    CLOSED: "סגור",
  };
  return statusMap[status] || status;
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

async function processTicketStatusChange(
  ticketId: number,
  companyId: number, // Added companyId
  ticketTitle: string,
  fromStatus: string,
  toStatus: string
) {
  console.log(
    `[Automation] Processing status change for Ticket #${ticketId} (Company ${companyId}): ${fromStatus} -> ${toStatus}`
  );

  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId, // Filter by company!
        isActive: true,
        triggerType: "TICKET_STATUS_CHANGE",
      },
    });

    console.log(
      `[Automation] Found ${rules.length} active rules for company ${companyId}`
    );

    // Translate statuses to Hebrew for display
    const fromStatusHebrew = translateStatus(fromStatus);
    const toStatusHebrew = translateStatus(toStatus);

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;
      console.log(
        `[Automation] Checking Rule #${rule.id}: ${rule.name}`,
        triggerConfig
      );

      // Check "From Status" condition
      if (
        triggerConfig.fromStatus &&
        triggerConfig.fromStatus !== "any" &&
        triggerConfig.fromStatus !== fromStatus
      ) {
        console.log(
          `[Automation] Rule #${rule.id} skipped: fromStatus mismatch (${triggerConfig.fromStatus} != ${fromStatus})`
        );
        continue;
      }

      // Check "To Status" condition
      if (
        triggerConfig.toStatus &&
        triggerConfig.toStatus !== "any" &&
        triggerConfig.toStatus !== toStatus
      ) {
        console.log(
          `[Automation] Rule #${rule.id} skipped: toStatus mismatch (${triggerConfig.toStatus} != ${toStatus})`
        );
        continue;
      }

      console.log(`[Automation] Rule #${rule.id} MATCHED! Executing action...`);

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as any;
        if (actionConfig.recipientId) {
          const message = (
            actionConfig.messageTemplate ||
            "הקריאה {ticketTitle} עברה לסטטוס {toStatus}"
          )
            .replace("{ticketTitle}", ticketTitle)
            .replace("{ticketId}", String(ticketId))
            .replace("{fromStatus}", fromStatusHebrew)
            .replace("{toStatus}", toStatusHebrew);

          await createNotificationForCompany({
            companyId,
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "עדכון בקריאת שירות",
            message,
            link: `/service`,
          });
          console.log(
            `[Automation] Notification sent to valid user associated with company ${companyId}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error processing ticket status change automations:", error);
  }
}
