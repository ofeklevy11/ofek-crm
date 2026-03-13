import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { createLogger } from "@/lib/logger";

const log = createLogger("SlaJobs");

// Serialized automation rule embedded in breach events to avoid N+1 queries
type EmbeddedRule = {
  id: number;
  name: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
};

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
  automationRules: EmbeddedRule[];
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
    timeouts: { finish: "120s" },
    concurrency: { limit: 1 },
  },
  [{ cron: "* * * * *" }, { event: "sla/manual-scan" }],
  async ({ step }) => {
    const now = new Date();

    // Step 1: Find companies that have overdue tickets (lightweight query)
    const companyIds = await step.run("find-companies", async () => {
      const COMPANY_LIMIT = 500;
      const responseCompanies = await prisma.ticket.findMany({
        where: {
          status: "OPEN",
          slaResponseDueDate: { lt: now },
        },
        select: { companyId: true },
        distinct: ["companyId"],
        take: COMPANY_LIMIT,
      });

      const resolveCompanies = await prisma.ticket.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
          slaDueDate: { lt: now },
        },
        select: { companyId: true },
        distinct: ["companyId"],
        take: COMPANY_LIMIT,
      });

      if (responseCompanies.length >= COMPANY_LIMIT || resolveCompanies.length >= COMPANY_LIMIT) {
        log.warn("Too many companies with overdue tickets — some may be skipped", { limit: COMPANY_LIMIT });
      }

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
          // Fetch overdue tickets without breaches subquery —
          // skipDuplicates on createMany + @@unique([ticketId, breachType, slaDueDate]) handles dedup
          const [openTickets, unresolvedTickets] = await Promise.all([
            // --- RESPONSE breach candidates ---
            prisma.ticket.findMany({
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
              },
              take: 500,
            }),
            // --- RESOLVE breach candidates ---
            prisma.ticket.findMany({
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
              },
              take: 500,
            }),
          ]);

          // Build breach data — duplicates are safely handled by skipDuplicates
          const breachData = [
            ...openTickets
              .filter((t) => t.slaResponseDueDate)
              .map((ticket) => ({
                companyId: ticket.companyId,
                ticketId: ticket.id,
                priority: ticket.priority,
                slaDueDate: ticket.slaResponseDueDate!,
                breachType: "RESPONSE" as const,
                breachedAt: now,
                status: "PENDING" as const,
              })),
            ...unresolvedTickets
              .filter((t) => t.slaDueDate)
              .map((ticket) => ({
                companyId: ticket.companyId,
                ticketId: ticket.id,
                priority: ticket.priority,
                slaDueDate: ticket.slaDueDate!,
                breachType: "RESOLVE" as const,
                breachedAt: now,
                status: "PENDING" as const,
              })),
          ];

          if (breachData.length === 0) return [];

          // Store batch timestamp before createMany to identify newly-created breaches
          const batchTimestamp = now;

          await prisma.slaBreach.createMany({
            data: breachData,
            skipDuplicates: true,
          });

          // Re-fetch using the exact breachedAt timestamp — single indexed seek
          // instead of building a large OR query over all ticket IDs
          const createdBreaches = await prisma.slaBreach.findMany({
            where: {
              companyId,
              status: "PENDING",
              breachedAt: batchTimestamp,
            },
            select: { id: true, ticketId: true, breachType: true },
          });

          // Prefetch SLA_BREACH automation rules once per company (eliminates N identical queries in handler)
          const companyRules = await prisma.automationRule.findMany({
            where: {
              companyId,
              isActive: true,
              triggerType: "SLA_BREACH",
            },
            select: {
              id: true,
              name: true,
              triggerConfig: true,
              actionType: true,
              actionConfig: true,
            },
            take: 500,
          });

          // Build lookup from ticket data for fan-out events
          type TicketInfo = { id: number; companyId: number; title: string; priority: string; status: string; assignee: { id: number; name: string } | null };
          const ticketMap = new Map<string, TicketInfo>();
          for (const t of openTickets) ticketMap.set(`${t.id}-RESPONSE`, t);
          for (const t of unresolvedTickets) ticketMap.set(`${t.id}-RESOLVE`, t);

          const breaches: BreachEvent[] = createdBreaches
            .map((b) => {
              const ticket = ticketMap.get(`${b.ticketId}-${b.breachType}`);
              if (!ticket) return null;
              return {
                ticketId: ticket.id,
                companyId: ticket.companyId,
                breachId: b.id,
                breachType: b.breachType as "RESPONSE" | "RESOLVE",
                ticketTitle: ticket.title,
                ticketPriority: ticket.priority,
                ticketStatus: ticket.status,
                assigneeName: ticket.assignee?.name || null,
                assigneeId: ticket.assignee?.id || null,
                automationRules: companyRules as EmbeddedRule[],
              };
            })
            .filter((b): b is BreachEvent => b !== null);

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
    timeouts: { finish: "120s" },
    concurrency: {
      limit: 2,
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
      automationRules,
    } = event.data;

    // SECURITY: Re-validate ticketId belongs to companyId (defense-in-depth)
    const ticketValid = await step.run("validate-ticket", async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, companyId },
        select: { id: true },
      });
      return !!ticket;
    });

    if (!ticketValid) {
      return { breachId, ticketId, breachType, error: "Ticket not found for company" };
    }

    // Rules are prefetched per-company in the scan step and embedded in the event payload
    // This eliminates N identical findMany queries (one per breach) for the same company
    const rules = automationRules || [];

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

      for (let actionIdx = 0; actionIdx < actions.length; actionIdx++) {
        const action = actions[actionIdx];
        // WhatsApp delay: use Inngest step.sleep instead of setTimeout
        if (
          action.type === "SEND_WHATSAPP" &&
          action.config?.delay &&
          action.config.delay > 0
        ) {
          // YY: Include action index to prevent step ID collision in MULTI_ACTION rules
          await step.sleep(
            `whatsapp-delay-rule-${rule.id}-action-${actionIdx}`,
            `${action.config.delay}s`,
          );
        }

        // YY: Include action index in step ID for uniqueness
        await step.run(
          `execute-rule-${rule.id}-${action.type}-${actionIdx}`,
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
          "@/lib/notifications-internal"
        );
        const message = replaceTemplateVars(
          actionConfig.messageTemplate ||
            "הקריאה {ticketTitle} חרגה מ{breachType}! עדיפות: {priority}",
        );

        const notifRes = await createNotificationForCompany({
          companyId,
          userId: actionConfig.recipientId,
          title:
            actionConfig.titleTemplate ||
            `⚠️ חריגת ${breachTypeLabels[breachType]}`,
          message,
          link: `/service`,
        });

        if (!notifRes.success) {
          throw new Error(
            `[SLA] Notification failed for user ${actionConfig.recipientId}: ${notifRes.error}`,
          );
        }

        log.info("Notification sent for SLA breach", { recipientId: actionConfig.recipientId, ticketId: contextData.ticketId });
      }
      break;
    }

    case "SEND_WHATSAPP": {
      let phone = "";
      if (actionConfig.phoneColumnId?.startsWith("manual:")) {
        phone = actionConfig.phoneColumnId.replace("manual:", "");
      }

      if (!phone) {
        throw new Error(
          `[SLA] WhatsApp action: No phone number configured for rule ${rule.id} ("${rule.name}")`,
        );
      }

      const content = replaceTemplateVars(actionConfig.content || "");

      // Dispatch to dedicated Inngest WhatsApp job for retry + rate limiting
      const { inngest: slaInngest } = await import("@/lib/inngest/client");
      await slaInngest.send({
        id: `wa-sla-${companyId}-${rule.id}-${contextData.ticketId}-${breachType}`,
        name: "automation/send-whatsapp",
        data: {
          companyId,
          phone: String(phone),
          content,
          messageType: actionConfig.messageType,
          mediaFileId: actionConfig.mediaFileId,
        },
      });
      log.info("WhatsApp job enqueued for SLA breach");
      break;
    }

    case "SEND_SMS": {
      let phone = "";
      if (actionConfig.phoneColumnId?.startsWith("manual:")) {
        phone = actionConfig.phoneColumnId.replace("manual:", "");
      }

      if (!phone) {
        throw new Error(
          `[SLA] SMS action: No phone number configured for rule ${rule.id} ("${rule.name}")`,
        );
      }

      const content = replaceTemplateVars(actionConfig.content || "");

      const { inngest: slaInngest } = await import("@/lib/inngest/client");
      await slaInngest.send({
        id: `sms-sla-${companyId}-${rule.id}-${contextData.ticketId}-${breachType}`,
        name: "automation/send-sms",
        data: {
          companyId,
          phone: String(phone),
          content,
        },
      });
      log.info("SMS job enqueued for SLA breach");
      break;
    }

    case "SEND_EMAIL": {
      let email = "";
      if (actionConfig.emailColumnId?.startsWith("manual:")) {
        email = actionConfig.emailColumnId.replace("manual:", "");
      }

      if (!email) {
        throw new Error(
          `[SLA] Email action: No email configured for rule ${rule.id} ("${rule.name}")`,
        );
      }

      const emailSubject = replaceTemplateVars(actionConfig.subject || "");
      const emailContent = replaceTemplateVars(actionConfig.content || "");

      const { inngest: slaEmailInngest } = await import("@/lib/inngest/client");
      await slaEmailInngest.send({
        id: `email-sla-${companyId}-${rule.id}-${contextData.ticketId}-${breachType}`,
        name: "automation/send-email",
        data: {
          companyId,
          to: String(email),
          subject: emailSubject,
          body: emailContent,
        },
      });
      log.info("Email job enqueued for SLA breach");
      break;
    }

    case "WEBHOOK": {
      const url = actionConfig.webhookUrl || actionConfig.url;
      if (!url) {
        throw new Error(
          `[SLA] Webhook action missing URL for Rule ${rule.id} ("${rule.name}")`
        );
      }

      // SECURITY: Block SSRF before dispatching to Inngest queue
      if (isPrivateUrl(url)) {
        throw new Error(
          `[SLA] Webhook URL targets private/internal address for Rule ${rule.id} ("${rule.name}")`
        );
      }

      // Dispatch to dedicated Inngest webhook job for retry + rate limiting
      const { inngest: slaWebhookInngest } = await import("@/lib/inngest/client");
      await slaWebhookInngest.send({
        id: `webhook-sla-${companyId}-${rule.id}-${contextData.ticketId}-${breachType}`,
        name: "automation/send-webhook",
        data: {
          url,
          companyId,
          ruleId: rule.id,
          payload: {
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: "SLA_BREACH",
            companyId,
            timestamp: new Date().toISOString(),
            data: contextData,
          },
        },
      });
      const urlHostname = (() => { try { return new URL(url).hostname; } catch { return "invalid-url"; } })();
      log.info("Webhook job enqueued for SLA breach", { hostname: urlHostname });
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

      let dueDate: Date | null = null;
      if (dueDays !== undefined && dueDays !== null && dueDays !== "") {
        const date = new Date();
        date.setDate(date.getDate() + Number(dueDays));
        dueDate = date;
      }

      // SECURITY: Validate assigneeId belongs to the same company
      let validAssigneeId: number | null = assigneeId ? Number(assigneeId) : null;
      if (validAssigneeId) {
        const validUser = await prisma.user.findFirst({
          where: { id: validAssigneeId, companyId },
          select: { id: true },
        });
        if (!validUser) validAssigneeId = null;
      }

      await prisma.task.create({
        data: {
          title: finalTitle,
          description: finalDesc,
          status: status || "todo",
          priority: priority || "high",
          assigneeId: validAssigneeId,
          dueDate: dueDate,
          tags: tags || ["SLA"],
          companyId: companyId,
        },
      });

      log.info("Task created for SLA breach", { title: finalTitle });
      break;
    }

    default:
      log.warn("Unknown SLA action type", { actionType });
  }
}
