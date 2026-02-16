import { inngest } from "../client";
import { createLogger } from "@/lib/logger";

const log = createLogger("TicketJobs");

/**
 * Background job for ticket notifications (assignee, comment).
 * Replaces inline createNotification() calls in createTicket, updateTicket, addTicketComment.
 */
export const processTicketNotificationJob = inngest.createFunction(
  {
    id: "process-ticket-notification",
    name: "Process Ticket Notification",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "ticket/notification" },
  async ({ event }) => {
    const { type, companyId } = event.data;

    const { createNotificationForCompany } = await import(
      "@/lib/notifications-internal"
    );

    if (type === "assignee") {
      const { assigneeId, ticketId, ticketTitle } = event.data;
      await createNotificationForCompany({
        companyId,
        userId: assigneeId,
        title: event.data.isNew ? "קריאה חדשה הוקצתה לך" : "קריאה הוקצתה לך",
        message: event.data.isNew
          ? `הוקצית לקריאה #${ticketId}: ${ticketTitle}`
          : `הוקצתה לך קריאה #${ticketId}: ${ticketTitle}`,
        link: `/service`,
      });
    } else if (type === "comment") {
      const { ticketId, userName } = event.data;
      const { prisma } = await import("@/lib/prisma");

      // SECURITY: Filter by companyId to prevent cross-tenant access
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, companyId },
        select: { assigneeId: true, title: true, id: true },
      });

      if (ticket && ticket.assigneeId && ticket.assigneeId !== event.data.userId) {
        await createNotificationForCompany({
          companyId,
          userId: ticket.assigneeId,
          title: "תגובה חדשה בקריאה",
          message: `${userName} הגיב בקריאה #${ticket.id}: ${ticket.title}`,
          link: `/service`,
          });
      }
    }

    return { success: true, type };
  },
);

/**
 * Background job for processing ticket status change automations.
 * Replaces inline processTicketStatusChange() in updateTicket.
 */
export const processTicketStatusChangeJob = inngest.createFunction(
  {
    id: "process-ticket-status-change",
    name: "Process Ticket Status Change",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "ticket/status-change" },
  async ({ event }) => {
    const { ticketId, companyId, ticketTitle, fromStatus, toStatus } =
      event.data;

    const { prisma } = await import("@/lib/prisma");
    const {
      createNotificationForCompany,
    } = await import("@/lib/notifications-internal");

    const statusMap: Record<string, string> = {
      OPEN: "פתוח",
      IN_PROGRESS: "בטיפול",
      WAITING: "ממתין",
      RESOLVED: "טופל",
      CLOSED: "סגור",
    };
    const fromStatusHebrew = statusMap[fromStatus] || fromStatus;
    const toStatusHebrew = statusMap[toStatus] || toStatus;

    const RULES_LIMIT = 500;
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId,
        isActive: true,
        triggerType: "TICKET_STATUS_CHANGE",
      },
      take: RULES_LIMIT,
    });
    if (rules.length >= RULES_LIMIT) {
      log.warn("Company has too many ticket automation rules — some may be skipped", { companyId, limit: RULES_LIMIT });
    }

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;

      if (
        triggerConfig.fromStatus &&
        triggerConfig.fromStatus !== "any" &&
        triggerConfig.fromStatus !== fromStatus
      ) {
        continue;
      }

      if (
        triggerConfig.toStatus &&
        triggerConfig.toStatus !== "any" &&
        triggerConfig.toStatus !== toStatus
      ) {
        continue;
      }

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as any;
        if (actionConfig.recipientId && !isNaN(actionConfig.recipientId)) {
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
        }
      }
    }

    return { success: true, ticketId, rulesProcessed: rules.length };
  },
);

/**
 * Background job for creating ticket activity logs.
 * Replaces inline createTicketActivityLogs() in updateTicket.
 */
export const processTicketActivityLogJob = inngest.createFunction(
  {
    id: "process-ticket-activity-log",
    name: "Process Ticket Activity Log",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "ticket/activity-log" },
  async ({ event }) => {
    const { ticketId, userId, companyId, previousData, newData } = event.data;

    const { createTicketActivityLogs } = await import(
      "@/lib/ticket-activity-utils"
    );
    await createTicketActivityLogs(ticketId, userId, previousData, newData, undefined, undefined, companyId);

    return { success: true, ticketId };
  },
);
