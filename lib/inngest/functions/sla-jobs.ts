import { inngest } from "../client";
import { prisma } from "@/lib/prisma";

// Shared breach type used across scan steps and events
type BreachEvent = {
  ticketId: number;
  companyId: number;
  breachId: number;
  breachType: "RESPONSE" | "RESOLVE";
  ticketTitle: string;
  ticketPriority: string;
  ticketStatus: string;
  assigneeName: string | null;
  assigneeId: number | null;
};

/**
 * SLA Scan — runs on a cron schedule (every minute).
 *
 * Strategy: scan per-company to avoid loading the entire ticket table at once.
 * 1. Fetch distinct company IDs that have overdue tickets (cheap indexed query)
 * 2. For each company, scan only its overdue tickets with a focused select
 * 3. Fan out one "sla/breach.detected" event per new breach
 */
export const slaScan = inngest.createFunction(
  {
    id: "sla-scan",
    name: "SLA Breach Scanner",
    retries: 2,
    concurrency: { limit: 1 },
  },
  [{ cron: "* * * * *" }, { event: "sla/manual-scan" }],
  async ({ step }) => {
    const now = new Date();

    // Step 1: Find companies that have overdue tickets (lightweight query)
    const companyIds = await step.run("find-companies", async () => {
      const responseCompanies = await prisma.ticket.findMany({
        where: {
          status: "OPEN",
          slaResponseDueDate: { lt: now },
        },
        select: { companyId: true },
        distinct: ["companyId"],
      });

      const resolveCompanies = await prisma.ticket.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
          slaDueDate: { lt: now },
        },
        select: { companyId: true },
        distinct: ["companyId"],
      });

      const ids = new Set([
        ...responseCompanies.map((t) => t.companyId),
        ...resolveCompanies.map((t) => t.companyId),
      ]);
      return Array.from(ids);
    });

    if (companyIds.length === 0) {
      return { scannedAt: now.toISOString(), companies: 0, totalBreaches: 0 };
    }

    // Step 2: Scan each company separately
    const allBreaches: BreachEvent[] = [];

    for (const companyId of companyIds) {
      const companyBreaches = await step.run(
        `scan-company-${companyId}`,
        async () => {
          const breaches: BreachEvent[] = [];

          // --- RESPONSE breaches ---
          const openTickets = await prisma.ticket.findMany({
            where: {
              companyId,
              status: "OPEN",
              slaResponseDueDate: { lt: now },
            },
            select: {
              id: true,
              companyId: true,
              title: true,
              priority: true,
              status: true,
              slaResponseDueDate: true,
              assignee: { select: { id: true, name: true } },
              breaches: {
                where: { breachType: "RESPONSE" },
                select: { slaDueDate: true },
              },
            },
          });

          for (const ticket of openTickets) {
            const alreadyBreached = ticket.breaches.some(
              (b) =>
                b.slaDueDate.getTime() ===
                ticket.slaResponseDueDate?.getTime(),
            );
            if (alreadyBreached) continue;

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

            breaches.push({
              ticketId: ticket.id,
              companyId: ticket.companyId,
              breachId: breach.id,
              breachType: "RESPONSE",
              ticketTitle: ticket.title,
              ticketPriority: ticket.priority,
              ticketStatus: ticket.status,
              assigneeName: ticket.assignee?.name || null,
              assigneeId: ticket.assignee?.id || null,
            });
          }

          // --- RESOLVE breaches ---
          const unresolvedTickets = await prisma.ticket.findMany({
            where: {
              companyId,
              status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
              slaDueDate: { lt: now },
            },
            select: {
              id: true,
              companyId: true,
              title: true,
              priority: true,
              status: true,
              slaDueDate: true,
              assignee: { select: { id: true, name: true } },
              breaches: {
                where: { breachType: "RESOLVE" },
                select: { slaDueDate: true },
              },
            },
          });

          for (const ticket of unresolvedTickets) {
            const alreadyBreached = ticket.breaches.some(
              (b) =>
                b.slaDueDate.getTime() === ticket.slaDueDate?.getTime(),
            );
            if (alreadyBreached) continue;

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

            breaches.push({
              ticketId: ticket.id,
              companyId: ticket.companyId,
              breachId: breach.id,
              breachType: "RESOLVE",
              ticketTitle: ticket.title,
              ticketPriority: ticket.priority,
              ticketStatus: ticket.status,
              assigneeName: ticket.assignee?.name || null,
              assigneeId: ticket.assignee?.id || null,
            });
          }

          return breaches;
        },
      );

      allBreaches.push(...companyBreaches);
    }

    // Step 3: Fan-out — send one event per breach for parallel processing
    if (allBreaches.length > 0) {
      await step.sendEvent(
        "fan-out-breaches",
        allBreaches.map((b) => ({
          name: "sla/breach.detected" as const,
          data: b,
        })),
      );
    }

    return {
      scannedAt: now.toISOString(),
      companies: companyIds.length,
      totalBreaches: allBreaches.length,
    };
  },
);

/**
 * SLA Breach Handler — processes a single breach event.
 * Finds matching automation rules and executes their actions.
 * Each breach runs independently with its own retries.
 */
export const slaBreachHandler = inngest.createFunction(
  {
    id: "sla-breach-handler",
    name: "SLA Breach Automation Handler",
    retries: 3,
    concurrency: {
      limit: 10,
      key: "event.data.companyId",
    },
  },
  { event: "sla/breach.detected" },
  async ({ event, step }) => {
    const {
      companyId,
      ticketId,
      breachId,
      breachType,
      ticketTitle,
      ticketPriority,
      ticketStatus,
      assigneeName,
      assigneeId,
    } = event.data;

    // Step 1: Fetch matching automation rules
    const rules = await step.run("fetch-rules", async () => {
      return prisma.automationRule.findMany({
        where: {
          companyId,
          isActive: true,
          triggerType: "SLA_BREACH",
        },
      });
    });

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

    const contextData = {
      ticketId,
      ticketTitle,
      priority: priorityLabels[ticketPriority] || ticketPriority,
      breachType: breachTypeLabels[breachType] || breachType,
      breachTypeRaw: breachType,
      assigneeName: assigneeName || "לא משויך",
      assigneeId,
      status: ticketStatus,
    };

    // Step 2: Execute each matching rule as its own step
    let executedCount = 0;

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;

      // Check priority filter
      if (
        triggerConfig.priority &&
        triggerConfig.priority !== "any" &&
        triggerConfig.priority !== ticketPriority
      ) {
        continue;
      }

      // Check breach type filter
      if (
        triggerConfig.breachType &&
        triggerConfig.breachType !== "any" &&
        triggerConfig.breachType !== breachType
      ) {
        continue;
      }

      // Collect actions to execute (flatten MULTI_ACTION)
      const actions: Array<{ type: string; config: any }> =
        rule.actionType === "MULTI_ACTION"
          ? (rule.actionConfig as any)?.actions || []
          : [{ type: rule.actionType, config: rule.actionConfig }];

      for (const action of actions) {
        // WhatsApp delay: use Inngest step.sleep instead of setTimeout
        if (
          action.type === "SEND_WHATSAPP" &&
          action.config?.delay &&
          action.config.delay > 0
        ) {
          await step.sleep(
            `whatsapp-delay-rule-${rule.id}`,
            `${action.config.delay}s`,
          );
        }

        await step.run(
          `execute-rule-${rule.id}-${action.type}`,
          async () => {
            await executeSlaAction(
              action.type,
              action.config,
              rule,
              contextData,
              companyId,
              breachType,
              breachTypeLabels,
            );
          },
        );
      }

      executedCount++;
    }

    return {
      breachId,
      ticketId,
      breachType,
      rulesEvaluated: rules.length,
      rulesExecuted: executedCount,
    };
  },
);

/**
 * Execute a single SLA automation action.
 * Delay handling is done at the caller level via step.sleep(),
 * so this function is pure execution — no setTimeout.
 */
async function executeSlaAction(
  actionType: string,
  actionConfig: any,
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

  switch (actionType) {
    case "SEND_NOTIFICATION": {
      if (actionConfig.recipientId) {
        const { createNotificationForCompany } = await import(
          "@/app/actions/notifications"
        );
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
      const { sendGreenApiMessage, sendGreenApiFile } = await import(
        "@/app/actions/green-api"
      );

      let phone = "";
      if (actionConfig.phoneColumnId?.startsWith("manual:")) {
        phone = actionConfig.phoneColumnId.replace("manual:", "");
      }

      if (!phone) {
        console.error(`[SLA] WhatsApp action: No phone number configured`);
        return;
      }

      const content = replaceTemplateVars(actionConfig.content || "");

      // NOTE: delay is handled by step.sleep() in the caller — no setTimeout here

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
}
