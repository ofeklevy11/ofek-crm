"use server";

import { prisma } from "@/lib/prisma";
import { createNotificationForCompany } from "@/app/actions/notifications";

/**
 * Check all open tickets for SLA breaches (both response and resolve) and trigger automations
 * This should be called periodically (e.g., every minute via cron)
 */
export async function checkSlaBreaches() {
  console.log("[SLA] Starting SLA breach check...");

  const now = new Date();
  let responseBreachesFound = 0;
  let resolveBreachesFound = 0;
  let automationsTriggered = 0;

  // =====================================================
  // 1. Check RESPONSE TIME breaches (tickets still OPEN)
  // =====================================================
  try {
    const openTickets = await prisma.ticket.findMany({
      where: {
        status: "OPEN", // Only OPEN tickets can have response breach
        slaResponseDueDate: { lt: now },
      },
      include: {
        breaches: true,
        assignee: { select: { id: true, name: true } },
      },
    });

    console.log(
      `[SLA] Found ${openTickets.length} tickets with response time overdue`,
    );

    for (const ticket of openTickets) {
      // Check if already has a RESPONSE breach for this deadline
      const existingResponseBreach = ticket.breaches.find(
        (b: any) =>
          b.breachType === "RESPONSE" &&
          b.slaDueDate.getTime() === ticket.slaResponseDueDate?.getTime(),
      );

      if (existingResponseBreach) {
        continue;
      }

      // Create RESPONSE breach record
      console.log(`[SLA] Creating RESPONSE breach for Ticket #${ticket.id}`);
      const breach = await prisma.slaBreach.create({
        data: {
          companyId: ticket.companyId,
          ticketId: ticket.id,
          priority: ticket.priority,
          slaDueDate: ticket.slaResponseDueDate!,
          breachType: "RESPONSE",
          breachedAt: now,
          status: "PENDING",
        },
      });
      responseBreachesFound++;

      // Trigger automations
      const triggeredCount = await triggerSlaBreachAutomations(
        ticket.companyId,
        ticket,
        breach,
        "RESPONSE",
      );
      automationsTriggered += triggeredCount;
    }
  } catch (error) {
    console.error("[SLA] Error checking RESPONSE breaches:", error);
  }

  // =====================================================
  // 2. Check RESOLVE TIME breaches (tickets not resolved)
  // =====================================================
  try {
    const unresolvedTickets = await prisma.ticket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
        slaDueDate: { lt: now },
      },
      include: {
        breaches: true,
        assignee: { select: { id: true, name: true } },
      },
    });

    console.log(
      `[SLA] Found ${unresolvedTickets.length} tickets with resolve time overdue`,
    );

    // Debug: Log total unresolved tickets to verify query isn't filtering too much
    const totalOpen = await prisma.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } },
    });
    console.log(`[SLA] Total unresolved tickets in system: ${totalOpen}`);

    for (const ticket of unresolvedTickets) {
      // Check if already has a RESOLVE breach for this deadline
      const existingResolveBreach = ticket.breaches.find(
        (b: any) =>
          b.breachType === "RESOLVE" &&
          b.slaDueDate.getTime() === ticket.slaDueDate?.getTime(),
      );

      if (existingResolveBreach) {
        // console.log(`[SLA] Ticket #${ticket.id} already has RESOLVE breach, skipping`);
        continue;
      }

      // Create RESOLVE breach record
      console.log(`[SLA] Creating RESOLVE breach for Ticket #${ticket.id}`);
      const breach = await prisma.slaBreach.create({
        data: {
          companyId: ticket.companyId,
          ticketId: ticket.id,
          priority: ticket.priority,
          slaDueDate: ticket.slaDueDate!,
          breachType: "RESOLVE",
          breachedAt: now,
          status: "PENDING",
        },
      });
      resolveBreachesFound++;

      // Trigger automations
      const triggeredCount = await triggerSlaBreachAutomations(
        ticket.companyId,
        ticket,
        breach,
        "RESOLVE",
      );
      automationsTriggered += triggeredCount;
    }
  } catch (error) {
    console.error("[SLA] Error checking RESOLVE breaches:", error);
  }

  const totalBreaches = responseBreachesFound + resolveBreachesFound;
  console.log(
    `[SLA] Check complete. Response Breaches: ${responseBreachesFound}, Resolve Breaches: ${resolveBreachesFound}, Automations: ${automationsTriggered}`,
  );

  return {
    success: true,
    breachesFound: totalBreaches,
    responseBreachesFound,
    resolveBreachesFound,
    automationsTriggered,
    checkedAt: now.toISOString(),
  };
}

/**
 * Trigger all matching SLA_BREACH automations for a breach
 * Now supports all action types: SEND_NOTIFICATION, SEND_WHATSAPP, WEBHOOK, CREATE_TASK, and MULTI_ACTION
 */
async function triggerSlaBreachAutomations(
  companyId: number,
  ticket: any,
  breach: any,
  breachType: "RESPONSE" | "RESOLVE",
): Promise<number> {
  let count = 0;

  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId,
        isActive: true,
        triggerType: "SLA_BREACH",
      },
    });

    console.log(
      `[SLA] Found ${rules.length} SLA_BREACH automations for company ${companyId}`,
    );

    const priorityLabels: Record<string, string> = {
      CRITICAL: "קריטי",
      HIGH: "גבוה",
      MEDIUM: "בינוני",
      LOW: "נמוך",
    };

    const breachTypeLabels: Record<string, string> = {
      RESPONSE: "זמן תגובה",
      RESOLVE: "זמן טיפול",
    };

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;
      console.log(
        `[SLA] Checking Rule #${rule.id} (${rule.name}) against ${breachType} breach for ticket ${ticket.id}`,
      );

      // Check priority filter
      if (
        triggerConfig.priority &&
        triggerConfig.priority !== "any" &&
        triggerConfig.priority !== ticket.priority
      ) {
        console.log(
          `[SLA] Rule ${rule.id} skipped - priority mismatch (rule: ${triggerConfig.priority}, ticket: ${ticket.priority})`,
        );
        continue;
      }

      // Check breach type filter (if specified)
      if (
        triggerConfig.breachType &&
        triggerConfig.breachType !== "any" &&
        triggerConfig.breachType !== breachType
      ) {
        console.log(
          `[SLA] Rule ${rule.id} skipped - breach type mismatch (rule: ${triggerConfig.breachType}, breach: ${breachType})`,
        );
        continue;
      }

      console.log(`[SLA] Executing automation rule ${rule.id}: ${rule.name}`);

      // Build context data for all action types
      const contextData = {
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        priority: priorityLabels[ticket.priority] || ticket.priority,
        breachType: breachTypeLabels[breachType] || breachType,
        breachTypeRaw: breachType,
        assigneeName: ticket.assignee?.name || "לא משויך",
        assigneeId: ticket.assignee?.id,
        status: ticket.status,
      };

      try {
        await executeSlaAction(
          rule,
          contextData,
          companyId,
          breachType,
          breachTypeLabels,
        );
        count++;
        console.log(`[SLA] Successfully executed rule ${rule.id}`);
      } catch (actionError) {
        console.error(`[SLA] Error executing rule ${rule.id}:`, actionError);
      }
    }
  } catch (error) {
    console.error("[SLA] Error triggering automations:", error);
  }

  return count;
}

/**
 * Execute a single SLA automation action (supports all action types)
 */
async function executeSlaAction(
  rule: any,
  contextData: any,
  companyId: number,
  breachType: "RESPONSE" | "RESOLVE",
  breachTypeLabels: Record<string, string>,
) {
  const replaceTemplateVars = (text: string) => {
    if (!text) return text;
    return text
      .replace(/{ticketTitle}/g, contextData.ticketTitle || "")
      .replace(/{ticketId}/g, String(contextData.ticketId || ""))
      .replace(/{priority}/g, contextData.priority || "")
      .replace(/{breachType}/g, contextData.breachType || "")
      .replace(/{assigneeName}/g, contextData.assigneeName || "")
      .replace(/{status}/g, contextData.status || "");
  };

  const executeAction = async (actionType: string, actionConfig: any) => {
    switch (actionType) {
      case "SEND_NOTIFICATION": {
        if (actionConfig.recipientId) {
          const message = replaceTemplateVars(
            actionConfig.messageTemplate ||
              "הקריאה {ticketTitle} חרגה מ{breachType}! עדיפות: {priority}",
          );

          await createNotificationForCompany({
            companyId,
            userId: actionConfig.recipientId,
            title:
              actionConfig.titleTemplate ||
              `⚠️ חריגת ${breachTypeLabels[breachType]}`,
            message,
            link: `/service`,
          });

          console.log(
            `[SLA] Notification sent to user ${actionConfig.recipientId} for ticket #${contextData.ticketId}`,
          );
        }
        break;
      }

      case "SEND_WHATSAPP": {
        const { sendGreenApiMessage, sendGreenApiFile } =
          await import("./green-api");

        let phone = "";
        if (actionConfig.phoneColumnId?.startsWith("manual:")) {
          phone = actionConfig.phoneColumnId.replace("manual:", "");
        }

        if (!phone) {
          console.error(`[SLA] WhatsApp action: No phone number configured`);
          return;
        }

        const content = replaceTemplateVars(actionConfig.content || "");

        // Handle delay if configured
        if (actionConfig.delay && actionConfig.delay > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, actionConfig.delay * 1000),
          );
        }

        if (actionConfig.messageType === "media" && actionConfig.mediaFileId) {
          const file = await prisma.file.findUnique({
            where: { id: Number(actionConfig.mediaFileId) },
          });

          if (file && file.url) {
            await sendGreenApiFile(
              companyId,
              phone,
              file.url,
              file.name,
              content,
            );
            console.log(`[SLA] WhatsApp file sent to ${phone}`);
          }
        } else {
          await sendGreenApiMessage(companyId, phone, content);
          console.log(`[SLA] WhatsApp message sent to ${phone}`);
        }
        break;
      }

      case "WEBHOOK": {
        const url = actionConfig.webhookUrl || actionConfig.url;
        if (!url) {
          console.warn(`[SLA] Webhook action missing URL for Rule ${rule.id}`);
          return;
        }

        const payload = {
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: "SLA_BREACH",
          companyId,
          timestamp: new Date().toISOString(),
          data: contextData,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.error(`[SLA] Webhook failed with status ${response.status}`);
        } else {
          console.log(`[SLA] Webhook sent successfully to ${url}`);
        }
        break;
      }

      case "CREATE_TASK": {
        const {
          title,
          description,
          status,
          priority,
          assigneeId,
          dueDays,
          tags,
        } = actionConfig;

        const finalTitle = replaceTemplateVars(title || "משימה מחריגת SLA");
        const finalDesc = replaceTemplateVars(description || "");

        let dueDate = null;
        if (dueDays !== undefined && dueDays !== null && dueDays !== "") {
          const date = new Date();
          date.setDate(date.getDate() + Number(dueDays));
          dueDate = date;
        }

        await prisma.task.create({
          data: {
            title: finalTitle,
            description: finalDesc,
            status: status || "todo",
            priority: priority || "high",
            assigneeId: assigneeId ? Number(assigneeId) : null,
            dueDate: dueDate,
            tags: tags || ["SLA"],
            companyId: companyId,
          },
        });

        console.log(`[SLA] Task created: ${finalTitle}`);
        break;
      }

      default:
        console.warn(`[SLA] Unknown action type: ${actionType}`);
    }
  };

  // Handle MULTI_ACTION
  if (rule.actionType === "MULTI_ACTION") {
    const actions = rule.actionConfig?.actions || [];
    for (const action of actions) {
      try {
        await executeAction(action.type, action.config);
      } catch (e) {
        console.error(`[SLA] Error executing action ${action.type}:`, e);
      }
    }
  } else {
    await executeAction(rule.actionType, rule.actionConfig);
  }
}

/**
 * Get SLA status for a ticket
 */
export async function getTicketSlaStatus(ticketId: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      slaDueDate: true,
      slaResponseDueDate: true,
      status: true,
      priority: true,
      breaches: {
        orderBy: { breachedAt: "desc" },
      },
    },
  });

  if (!ticket) return null;

  const now = new Date();

  // Response breach check
  const hasResponseBreach = ticket.breaches.some(
    (b: any) => b.breachType === "RESPONSE",
  );
  const isResponseOverdue =
    ticket.status === "OPEN" && ticket.slaResponseDueDate
      ? ticket.slaResponseDueDate < now
      : false;

  // Resolve breach check
  const hasResolveBreach = ticket.breaches.some(
    (b: any) => b.breachType === "RESOLVE",
  );
  const isResolveOverdue = ticket.slaDueDate ? ticket.slaDueDate < now : false;

  let responseRemainingMinutes: number | null = null;
  if (
    ticket.slaResponseDueDate &&
    !hasResponseBreach &&
    ticket.status === "OPEN"
  ) {
    responseRemainingMinutes = Math.floor(
      (ticket.slaResponseDueDate.getTime() - now.getTime()) / (1000 * 60),
    );
  }

  let resolveRemainingMinutes: number | null = null;
  if (ticket.slaDueDate && !hasResolveBreach) {
    resolveRemainingMinutes = Math.floor(
      (ticket.slaDueDate.getTime() - now.getTime()) / (1000 * 60),
    );
  }

  return {
    slaDueDate: ticket.slaDueDate,
    slaResponseDueDate: ticket.slaResponseDueDate,
    hasResponseBreach,
    hasResolveBreach,
    isResponseOverdue,
    isResolveOverdue,
    responseRemainingMinutes,
    resolveRemainingMinutes,
    breaches: ticket.breaches,
  };
}
