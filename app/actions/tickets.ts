"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { validateUserInCompany, validateClientInCompany } from "@/lib/company-validation";
import { getCachedMetric } from "@/lib/services/cache-service";
import { redis } from "@/lib/redis";
import { TicketStatus, TicketPriority, TicketType } from "@prisma/client";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasUserFlag } from "@/lib/permissions";
import { createLogger } from "@/lib/logger";

const log = createLogger("Tickets");

const MAX_TITLE = 500;
const MAX_DESCRIPTION = 10_000;
const MAX_COMMENT = 5_000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;
const MIN_SLA_MINUTES = 1;
const MAX_SLA_MINUTES = 525_600; // 1 year

function assertServiceAccess(user: { role: string; permissions?: Record<string, boolean> }) {
  if (!hasUserFlag(user as any, "canViewServiceCalls")) {
    throw new Error("Unauthorized");
  }
}

function serviceStatsKey(companyId: number) {
  return `service:stats:${companyId}`;
}
function slaPoliciesKey(companyId: number) {
  return `service:sla-policies:${companyId}`;
}
async function invalidateServiceCache(companyId: number) {
  try {
    await redis.del(
      `cache:metric:${serviceStatsKey(companyId)}`,
      `cache:metric:${slaPoliciesKey(companyId)}`,
    );
  } catch {}
}

// P3: Derive validation sets from Prisma enums (single source of truth)
const VALID_STATUSES = new Set<string>(Object.values(TicketStatus));
const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority));
const VALID_TYPES = new Set<string>(Object.values(TicketType));

const PAGE_SIZE = 100;

// P2: Cursor-based pagination
export async function getTickets(cursor?: number) {
  const user = await getCurrentUser();
  if (!user) return { items: [] as any[], nextCursor: null as number | null };
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  const items = await withRetry(() => prisma.ticket.findMany({
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: {
      companyId: user.companyId,
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      createdAt: true,
      updatedAt: true,
      assignee: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  }));

  let nextCursor: number | null = null;
  if (items.length > PAGE_SIZE) {
    items.pop();
    nextCursor = items[items.length - 1].id;
  }

  return { items, nextCursor };
}

// On-demand loading of ticket details with comments and activity logs
export async function getTicketDetails(ticketId: number) {
  const user = await getCurrentUser();
  if (!user) return null;
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  return await withRetry(() => prisma.ticket.findFirst({
    where: {
      id: ticketId,
      companyId: user.companyId,
    },
    select: {
      id: true, title: true, description: true, status: true, priority: true,
      type: true, clientId: true, assigneeId: true, creatorId: true, tags: true,
      slaDueDate: true, slaResponseDueDate: true, createdAt: true, updatedAt: true,
      assignee: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, email: true, businessName: true } },
      creator: { select: { id: true, name: true } },
      comments: {
        select: {
          id: true, content: true, isInternal: true, createdAt: true, updatedAt: true,
          userId: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      activityLogs: {
        select: {
          id: true, fieldName: true, fieldLabel: true, oldValue: true, newValue: true,
          oldLabel: true, newLabel: true, createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  }));
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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Input validation
  if (!data.title || data.title.length > MAX_TITLE) throw new Error("Invalid title");
  if (data.description && data.description.length > MAX_DESCRIPTION) throw new Error("Description too long");
  if (data.tags) {
    if (data.tags.length > MAX_TAGS) throw new Error("Too many tags");
    if (data.tags.some(t => t.length > MAX_TAG_LENGTH)) throw new Error("Tag too long");
  }

  // Validate enum values before any DB operations
  if (!VALID_STATUSES.has(data.status)) throw new Error("Invalid status");
  if (!VALID_PRIORITIES.has(data.priority)) throw new Error("Invalid priority");
  if (!VALID_TYPES.has(data.type)) throw new Error("Invalid type");

  // Run SLA policy lookup + cross-company validations in parallel
  const [slaPolicy, assigneeValid, clientValid] = await Promise.all([
    data.priority
      ? withRetry(() => prisma.slaPolicy.findUnique({
          where: {
            companyId_priority: {
              companyId: user.companyId,
              priority: data.priority as TicketPriority,
            },
          },
        }))
      : null,
    data.assigneeId
      ? validateUserInCompany(data.assigneeId, user.companyId)
      : true,
    data.clientId
      ? validateClientInCompany(data.clientId, user.companyId)
      : true,
  ]);

  // SECURITY: Validate cross-company references
  if (!assigneeValid) throw new Error("Invalid assignee");
  if (!clientValid) throw new Error("Invalid client");

  // Auto-calculate SLA dates if not provided
  let calculatedSlaDueDate = data.slaDueDate;
  let calculatedSlaResponseDueDate = data.slaResponseDueDate;

  if (slaPolicy) {
    if (!calculatedSlaDueDate && slaPolicy.resolveTimeMinutes) {
      calculatedSlaDueDate = new Date(
        Date.now() + slaPolicy.resolveTimeMinutes * 60 * 1000,
      );
    }
    if (!calculatedSlaResponseDueDate && slaPolicy.responseTimeMinutes) {
      calculatedSlaResponseDueDate = new Date(
        Date.now() + slaPolicy.responseTimeMinutes * 60 * 1000,
      );
    }
  }

  // P3: Construct data with proper enum types instead of spreading raw input
  const ticket = await withRetry(() => prisma.ticket.create({
    data: {
      title: data.title,
      description: data.description,
      status: data.status as TicketStatus,
      priority: data.priority as TicketPriority,
      type: data.type as TicketType,
      clientId: data.clientId,
      assigneeId: data.assigneeId,
      tags: data.tags,
      slaDueDate: calculatedSlaDueDate,
      slaResponseDueDate: calculatedSlaResponseDueDate,
      companyId: user.companyId,
      creatorId: user.id,
    },
    select: {
      id: true, title: true, description: true, status: true,
      priority: true, type: true, clientId: true, assigneeId: true,
      creatorId: true, tags: true, slaDueDate: true, slaResponseDueDate: true,
      createdAt: true, updatedAt: true,
    },
  }));

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
      log.error("Ticket notification inngest.send failed", { error: String(error) });
    }
  }

  await invalidateServiceCache(user.companyId);
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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Input validation
  if (data.title !== undefined && (!data.title || data.title.length > MAX_TITLE)) throw new Error("Invalid title");
  if (data.description !== undefined && data.description.length > MAX_DESCRIPTION) throw new Error("Description too long");
  if (data.tags) {
    if (data.tags.length > MAX_TAGS) throw new Error("Too many tags");
    if (data.tags.some(t => t.length > MAX_TAG_LENGTH)) throw new Error("Tag too long");
  }

  // Validate enum values if provided
  if (data.status && !VALID_STATUSES.has(data.status)) throw new Error("Invalid status");
  if (data.priority && !VALID_PRIORITIES.has(data.priority)) throw new Error("Invalid priority");
  if (data.type && !VALID_TYPES.has(data.type)) throw new Error("Invalid type");

  // Validate cross-company references outside the transaction (read-only checks)
  const [assigneeValid, clientValid] = await Promise.all([
    data.assigneeId
      ? validateUserInCompany(data.assigneeId, user.companyId)
      : true,
    data.clientId !== undefined && data.clientId !== null
      ? validateClientInCompany(data.clientId, user.companyId)
      : true,
  ]);

  if (!assigneeValid) throw new Error("Invalid assignee");
  if (!clientValid) throw new Error("Invalid client");

  // Interactive transaction: read + validate + write atomically to prevent TOCTOU
  const { ticket, currentTicket } = await withRetry(() => prisma.$transaction(async (tx) => {
    // P1: Acquire row-level lock to prevent concurrent modifications (lost updates)
    const locked: { id: number }[] = await tx.$queryRawUnsafe(
      `SELECT id FROM "Ticket" WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      id,
      user.companyId,
    );
    if (locked.length === 0) throw new Error("Ticket not found");

    const current = await tx.ticket.findUnique({
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

    if (!current) throw new Error("Ticket not found");

    // P3: Build update data with explicit field picking (no spread — prevents field injection)
    const updateData: Record<string, any> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.slaDueDate !== undefined) updateData.slaDueDate = data.slaDueDate;
    if (data.status) updateData.status = data.status as TicketStatus;
    if (data.priority) updateData.priority = data.priority as TicketPriority;
    if (data.type) updateData.type = data.type as TicketType;

    // Check if priority is being changed - if so, recalculate SLA dates
    if (data.priority && data.priority !== current.priority) {
      const slaPolicy = await tx.slaPolicy.findUnique({
        where: {
          companyId_priority: {
            companyId: user.companyId,
            priority: data.priority as TicketPriority,
          },
        },
      });

      if (slaPolicy) {
        const now = Date.now();

        if (slaPolicy.resolveTimeMinutes) {
          updateData.slaDueDate = new Date(
            now + slaPolicy.resolveTimeMinutes * 60 * 1000,
          );
        }

        const newStatus = data.status || current.status;
        if (newStatus === "OPEN" && slaPolicy.responseTimeMinutes) {
          updateData.slaResponseDueDate = new Date(
            now + slaPolicy.responseTimeMinutes * 60 * 1000,
          );
        }
      } else {
        updateData.slaDueDate = undefined;
        updateData.slaResponseDueDate = undefined;
      }
    }

    const updated = await tx.ticket.update({
      where: { id, companyId: user.companyId },
      data: updateData,
      select: {
        id: true, title: true, description: true, status: true,
        priority: true, type: true, clientId: true, assigneeId: true,
        creatorId: true, tags: true, slaDueDate: true, slaResponseDueDate: true,
        createdAt: true, updatedAt: true,
      },
    });

    return { ticket: updated, currentTicket: current };
  }, { maxWait: 5000, timeout: 10000 }));

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
    log.error("Inngest send failed, falling back to direct execution", { error: String(error) });
    // Direct fallback: process ticket status change automations inline
    try {
      if (data.status && data.status !== currentTicket.status) {
        const statusMap: Record<string, string> = {
          OPEN: "פתוח", IN_PROGRESS: "בטיפול", WAITING: "ממתין", RESOLVED: "טופל", CLOSED: "סגור",
        };
        const fromStatusHebrew = statusMap[currentTicket.status] || currentTicket.status;
        const toStatusHebrew = statusMap[data.status] || data.status;

        const rules = await prisma.automationRule.findMany({
          where: { companyId: user.companyId, isActive: true, triggerType: "TICKET_STATUS_CHANGE" },
          take: 200,
        });

        for (const rule of rules) {
          const tc = rule.triggerConfig as any;
          if (tc.fromStatus && tc.fromStatus !== "any" && tc.fromStatus !== currentTicket.status) continue;
          if (tc.toStatus && tc.toStatus !== "any" && tc.toStatus !== data.status) continue;

          if (rule.actionType === "SEND_NOTIFICATION") {
            const ac = rule.actionConfig as any;
            if (ac.recipientId && !isNaN(ac.recipientId)) {
              const message = (ac.messageTemplate || "הקריאה {ticketTitle} עברה לסטטוס {toStatus}")
                .replace("{ticketTitle}", ticket.title)
                .replace("{ticketId}", String(ticket.id))
                .replace("{fromStatus}", fromStatusHebrew)
                .replace("{toStatus}", toStatusHebrew);
              const { createNotificationForCompany } = await import("@/lib/notifications-internal");
              await createNotificationForCompany({
                companyId: user.companyId,
                userId: ac.recipientId,
                title: ac.titleTemplate || "עדכון בקריאת שירות",
                message,
                link: "/service",
              });
            }
          }
        }
      }
    } catch (directErr) {
      log.error("Direct automation execution also failed", { error: String(directErr) });
    }
  }

  await invalidateServiceCache(user.companyId);
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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }
  if (!content || content.length > MAX_COMMENT) throw new Error("Invalid comment");

  // Verify ticket belongs to user's company before creating comment
  const ticket = await withRetry(() => prisma.ticket.findFirst({
    where: { id: ticketId, companyId: user.companyId },
    select: { id: true },
  }));
  if (!ticket) throw new Error("Unauthorized");

  const comment = await withRetry(() => prisma.ticketComment.create({
    data: {
      ticketId,
      userId: user.id,
      content,
      isInternal,
    },
    select: {
      id: true, ticketId: true, userId: true, content: true,
      isInternal: true, createdAt: true, updatedAt: true,
    },
  }));

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
    log.error("Comment notification inngest.send failed", { error: String(error) });
  }

  revalidatePath("/service");
  return comment;
}

export async function updateTicketComment(commentId: number, content: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }
  if (!content || content.length > MAX_COMMENT) throw new Error("Invalid comment");

  // Find the comment and verify permissions
  const comment = await withRetry(() => prisma.ticketComment.findFirst({
    where: {
      id: commentId,
      ticket: { companyId: user.companyId },
    },
    select: { id: true, userId: true },
  }));

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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Find the comment and verify permissions
  const comment = await withRetry(() => prisma.ticketComment.findFirst({
    where: {
      id: commentId,
      ticket: { companyId: user.companyId },
    },
    select: { id: true, userId: true },
  }));

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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  return getCachedMetric(
    slaPoliciesKey(user.companyId),
    async () => {
      return withRetry(() => prisma.slaPolicy.findMany({
        where: { companyId: user.companyId },
        select: {
          id: true, name: true, description: true, priority: true,
          responseTimeMinutes: true, resolveTimeMinutes: true,
        },
        take: 50,
      }));
    },
    300, // 5-minute TTL
  );
}

export async function updateSlaPolicy(data: {
  priority: string;
  responseTimeMinutes: number;
  resolveTimeMinutes: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // P3: Validate priority against enum
  if (!VALID_PRIORITIES.has(data.priority)) throw new Error("Invalid priority");

  // Validate SLA minute ranges
  if (!Number.isInteger(data.responseTimeMinutes) || data.responseTimeMinutes < MIN_SLA_MINUTES || data.responseTimeMinutes > MAX_SLA_MINUTES) {
    throw new Error("Invalid response time");
  }
  if (!Number.isInteger(data.resolveTimeMinutes) || data.resolveTimeMinutes < MIN_SLA_MINUTES || data.resolveTimeMinutes > MAX_SLA_MINUTES) {
    throw new Error("Invalid resolve time");
  }

  const policy = await prisma.slaPolicy.upsert({
    where: {
      companyId_priority: {
        companyId: user.companyId,
        priority: data.priority as TicketPriority,
      },
    },
    update: {
      responseTimeMinutes: data.responseTimeMinutes,
      resolveTimeMinutes: data.resolveTimeMinutes,
    },
    create: {
      companyId: user.companyId,
      priority: data.priority as TicketPriority,
      name: `${data.priority} Policy`,
      responseTimeMinutes: data.responseTimeMinutes,
      resolveTimeMinutes: data.resolveTimeMinutes,
    },
    select: {
      id: true, name: true, description: true, priority: true,
      responseTimeMinutes: true, resolveTimeMinutes: true,
    },
  });

  await invalidateServiceCache(user.companyId);
  revalidatePath("/service");
  return policy;
}

// P6: Atomic delete — no TOCTOU gap, cascade handled by DB foreign key constraints
export async function deleteTicket(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  const { count } = await prisma.ticket.deleteMany({
    where: { id, companyId: user.companyId },
  });

  if (count === 0) throw new Error("Ticket not found");

  await invalidateServiceCache(user.companyId);
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
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  return getCachedMetric(
    serviceStatsKey(user.companyId),
    async () => {
      const [statusCounts, breachCount] = await Promise.all([
        withRetry(() => prisma.ticket.groupBy({
          by: ["status"],
          where: { companyId: user.companyId },
          _count: { status: true },
        })),
        withRetry(() => prisma.slaBreach.count({
          where: {
            companyId: user.companyId,
            status: "PENDING",
          },
        })),
      ]);

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
    },
    30, // 30-second TTL
  );
}

// P7: Extracted from page.tsx — bounded and reusable server action
export async function getServiceAutomationRules() {
  const user = await getCurrentUser();
  if (!user) return [];
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  return withRetry(() => prisma.automationRule.findMany({
    where: {
      companyId: user.companyId,
      triggerType: { in: ["TICKET_STATUS_CHANGE", "SLA_BREACH"] },
    },
    select: {
      id: true,
      name: true,
      triggerType: true,
      triggerConfig: true,
      actionType: true,
      actionConfig: true,
      isActive: true,
      folderId: true,
      calendarEventId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  }));
}

export async function getServiceUsers() {
  const user = await getCurrentUser();
  if (!user) return [];
  assertServiceAccess(user);
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  return withRetry(() => prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 200,
  }));
}
