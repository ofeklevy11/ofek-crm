import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { executeRuleActions } from "./automations-core";
import { createLogger } from "@/lib/logger";

const log = createLogger("EventAutoCore");

export async function processEventAutomations(companyId?: number, _internalToken?: string) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !_internalToken ||
    _internalToken.length !== secret.length ||
    !timingSafeEqual(Buffer.from(_internalToken), Buffer.from(secret))
  ) {
    throw new Error("Unauthorized: internal function");
  }
  if (!companyId) {
    throw new Error("[EventAutomations] companyId is required — skipping to prevent cross-tenant query");
  }
  log.info("Checking event-based automations", { companyId });
  try {
    // Single query: fetch rules + events + existing logs in one pass
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "EVENT_TIME",
        calendarEventId: { not: null },
        companyId,
        calendarEvent: {
          startTime: { gte: cutoff },
        },
      },
      include: {
        calendarEvent: {
          select: { id: true, title: true, description: true, startTime: true, endTime: true },
        },
        executedLogs: {
          where: { calendarEventId: { not: null } },
          select: { calendarEventId: true },
        },
      },
      take: 500,
    });

    log.info("Found active rules", { count: rules.length });

    const now = new Date();

    // Filter in one pass: trigger time must have passed, event must exist, not already executed
    const unexecutedRules = rules.filter((rule) => {
      if (!rule.calendarEvent) return false;
      // Already executed for this event?
      if (rule.executedLogs.some((l) => l.calendarEventId === rule.calendarEventId)) return false;
      const eventStart = new Date(rule.calendarEvent.startTime);
      const minutesBefore = Number((rule.triggerConfig as any)?.minutesBefore || 0);
      const targetTime = new Date(eventStart.getTime() - minutesBefore * 60000);
      return now >= targetTime;
    });

    if (unexecutedRules.length === 0) return;

    log.info("Rules to execute", { count: unexecutedRules.length });

    // Issue C fix: Process rules in parallel with concurrency limit of 5
    const RULE_CONCURRENCY = 5;
    let totalFailures = 0;
    for (let i = 0; i < unexecutedRules.length; i += RULE_CONCURRENCY) {
      const batch = unexecutedRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (rule) => {
          // Issue B fix: Create log FIRST to claim execution, then execute.
          // If another worker already claimed it, the unique constraint will throw P2002.
          try {
            await prisma.automationLog.create({
              data: {
                automationRuleId: rule.id,
                calendarEventId: rule.calendarEventId as string,
                companyId: rule.companyId,
              },
            });
          } catch (createErr: any) {
            if (createErr?.code === "P2002") {
              // Another worker already claimed this — skip
              log.info("Rule already claimed by another worker, skipping", { ruleId: rule.id });
              return;
            }
            throw createErr;
          }

          log.info("Triggering rule for event", { ruleId: rule.id, actionType: rule.actionType, eventTitle: rule.calendarEvent!.title });

          const event = rule.calendarEvent!;
          const eventRecordData = {
            title: event.title,
            description: event.description,
            start: event.startTime.toISOString(),
            end: event.endTime.toISOString(),
            taskTitle: event.title,
            eventTitle: event.title,
            eventStart: event.startTime.toLocaleString("he-IL"),
            eventEnd: event.endTime.toLocaleString("he-IL"),
            eventStartDate: event.startTime.toISOString().split("T")[0],
            eventStartTime: event.startTime.toTimeString().slice(0, 5),
            eventEndDate: event.endTime.toISOString().split("T")[0],
            eventEndTime: event.endTime.toTimeString().slice(0, 5),
            time: event.startTime.toLocaleString("he-IL"),
          };

          try {
            await executeRuleActions(rule, {
              recordData: eventRecordData,
              tableName: "Calendar",
            });
            log.info("Rule executed successfully", { ruleId: rule.id });
          } catch (execErr) {
            // Execution failed but log is already created — delete it so it can be retried
            try {
              await prisma.automationLog.delete({
                where: {
                  automationRuleId_calendarEventId: {
                    automationRuleId: rule.id,
                    calendarEventId: rule.calendarEventId as string,
                  },
                },
              });
            } catch (cleanupErr) { log.error("Cleanup failed for rule", { ruleId: rule.id, error: String(cleanupErr) }); }
            throw execErr;
          }
        }),
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          log.error("Error processing rule", { ruleId: batch[j].id, error: String((results[j] as PromiseRejectedResult).reason) });
        }
      }
    }

    // Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= unexecutedRules.length * 0.5) {
      throw new Error(`[Event Automations] ${totalFailures}/${unexecutedRules.length} event rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    log.error("Error processing event automations", { error: String(error) });
    throw error; // Re-throw so Inngest sees the failure
  }
}
