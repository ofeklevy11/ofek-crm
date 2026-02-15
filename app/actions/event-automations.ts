"use server";

import { prisma } from "@/lib/prisma";
import { executeRuleActions } from "./automations";
import { revalidatePath } from "next/cache";

// --- Types ---

interface EventAutomationData {
  eventId: string;
  minutesBefore: number;
  actionType: string;
  actionConfig: any;
  name?: string;
}

// --- Global Automations CRUD ---
export async function createGlobalEventAutomation(
  data: Omit<EventAutomationData, "eventId">,
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    let finalActionConfig = data.actionConfig;
    if (
      data.actionType === "SEND_NOTIFICATION" &&
      !finalActionConfig.recipientId
    ) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const rule = await prisma.automationRule.create({
      data: {
        companyId: currentUser.companyId,
        name:
          data.name ||
          `אוטומציה קבועה לאירועים (${data.minutesBefore} דקות לפני)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
        calendarEventId: null, // Global
        createdBy: currentUser.id,
      },
      select: { id: true },
    });

    // revalidatePath("/calendar");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error creating global event automation:", error);
    return { success: false, error: "Failed to create global automation" };
  }
}

export async function getGlobalEventAutomations() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: currentUser.companyId,
        triggerType: "EVENT_TIME",
        calendarEventId: null, // Global template
      },
      select: {
        id: true,
        name: true,
        actionType: true,
        actionConfig: true,
        triggerConfig: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200, // P73: Bound UI-facing query
    });

    return { success: true, data: rules };
  } catch (error) {
    console.error("Error fetching global automations:", error);
    return { success: false, error: "Failed to fetch global automations" };
  }
}

export async function updateGlobalEventAutomation(
  data: Omit<EventAutomationData, "eventId"> & { id: number },
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    let finalActionConfig = data.actionConfig;
    if (
      data.actionType === "SEND_NOTIFICATION" &&
      !finalActionConfig.recipientId
    ) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const rule = await prisma.automationRule.update({
      where: { id: data.id, companyId: currentUser.companyId },
      data: {
        name:
          data.name ||
          `אוטומציה קבועה לאירועים (${data.minutesBefore} דקות לפני)`,
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
      },
      select: { id: true },
    });

    return { success: true, data: rule };
  } catch (error) {
    console.error("Error updating global event automation:", error);
    return { success: false, error: "Failed to update global automation" };
  }
}

export async function deleteGlobalEventAutomation(id: number) {
  // We can reuse deleteEventAutomation technically but better to be explicit or rename deleteEventAutomation to deleteAutomationRule
  // deleteEventAutomation implementation checks companyId, so it is safe.
  return deleteEventAutomation(id);
}

// --- CRUD ---

export async function createEventAutomation(data: EventAutomationData) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    if (!data.eventId) return { success: false, error: "Event ID is required" };

    const event = await prisma.calendarEvent.findFirst({
      where: { id: data.eventId, companyId: currentUser.companyId },
      select: { id: true },
    });

    if (!event) return { success: false, error: "Event not found" };

    // Inject current user as recipient for notifications if not specified
    let finalActionConfig = data.actionConfig;
    if (
      data.actionType === "SEND_NOTIFICATION" &&
      !finalActionConfig.recipientId
    ) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const rule = await prisma.automationRule.create({
      data: {
        companyId: currentUser.companyId,
        name: data.name || `אוטומציה לאירוע (${data.minutesBefore} דקות לפני)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
        calendarEventId: data.eventId,
        createdBy: currentUser.id,
      },
      select: { id: true },
    });

    revalidatePath("/calendar");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error creating event automation:", error);
    return { success: false, error: "Failed to create automation" };
  }
}

export async function getEventAutomations(eventId: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    const rules = await prisma.automationRule.findMany({
      where: {
        calendarEventId: eventId,
        companyId: currentUser.companyId,
      },
      select: {
        id: true,
        name: true,
        actionType: true,
        actionConfig: true,
        triggerConfig: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200, // P74: Bound UI-facing query
    });

    return { success: true, data: rules };
  } catch (error) {
    console.error("Error fetching event automations:", error);
    return { success: false, error: "Failed to fetch event automations" };
  }
}

/** Shared helper: returns the max number of event-specific automations across all events for a company. */
async function queryMaxEventAutomationCount(companyId: number): Promise<number> {
  const result = await prisma.$queryRaw<[{ max_count: bigint }]>`
    SELECT COALESCE(MAX(cnt), 0) AS max_count
    FROM (
      SELECT COUNT(*) AS cnt
      FROM "AutomationRule"
      WHERE "companyId" = ${companyId}
        AND "triggerType" = 'EVENT_TIME'
        AND "calendarEventId" IS NOT NULL
      GROUP BY "calendarEventId"
    ) sub
  `;
  return Number(result[0]?.max_count ?? 0);
}

export async function getMaxEventAutomationCount() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    const count = await queryMaxEventAutomationCount(currentUser.companyId);
    return { success: true, count };
  } catch (error) {
    console.error("Error fetching max event automation count:", error);
    return { success: false, error: "Failed to fetch max count" };
  }
}

// --- Combined Init Actions (Issue 4: reduce DB round-trips on modal open) ---

export async function getEventModalInitData(eventId?: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    const [eventAutomations, globalAutomationCount] = await Promise.all([
      eventId
        ? prisma.automationRule.findMany({
            where: { calendarEventId: eventId, companyId: currentUser.companyId },
            select: {
              id: true,
              name: true,
              actionType: true,
              actionConfig: true,
              triggerConfig: true,
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : Promise.resolve([]),
      prisma.automationRule.count({
        where: {
          companyId: currentUser.companyId,
          triggerType: "EVENT_TIME",
          calendarEventId: null,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        userPlan: (currentUser as any).isPremium || "basic",
        eventAutomations,
        globalAutomationCount,
      },
    };
  } catch (error) {
    console.error("Error fetching event modal init data:", error);
    return { success: false, error: "Failed to fetch modal data" };
  }
}

export async function getGlobalAutomationsModalData() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    const [globalRules, maxSpecificCount] = await Promise.all([
      prisma.automationRule.findMany({
        where: {
          companyId: currentUser.companyId,
          triggerType: "EVENT_TIME",
          calendarEventId: null,
        },
        select: {
          id: true,
          name: true,
          actionType: true,
          actionConfig: true,
          triggerConfig: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      queryMaxEventAutomationCount(currentUser.companyId),
    ]);

    return {
      success: true,
      data: {
        automations: globalRules,
        maxSpecificCount,
        userPlan: (currentUser as any).isPremium || "basic",
      },
    };
  } catch (error) {
    console.error("Error fetching global automations modal data:", error);
    return { success: false, error: "Failed to fetch modal data" };
  }
}

export async function updateEventAutomation(
  data: Omit<EventAutomationData, "eventId"> & { id: number },
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    let finalActionConfig = data.actionConfig;
    if (
      data.actionType === "SEND_NOTIFICATION" &&
      !finalActionConfig.recipientId
    ) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const rule = await prisma.automationRule.update({
      where: { id: data.id, companyId: currentUser.companyId },
      data: {
        name:
          data.name ||
          `אוטומציה לאירוע (${data.minutesBefore} דקות לפני)`,
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
      },
      select: { id: true },
    });

    revalidatePath("/calendar");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error updating event automation:", error);
    return { success: false, error: "Failed to update automation" };
  }
}

export async function deleteEventAutomation(ruleId: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };

    await prisma.automationRule.delete({
      where: { id: ruleId, companyId: currentUser.companyId },
    });

    revalidatePath("/calendar");
    return { success: true };
  } catch (error) {
    console.error("Error deleting event automation:", error);
    return { success: false, error: "Failed to delete automation" };
  }
}

// --- CRON Logic ---

export async function processEventAutomations(companyId?: number) {
  if (!companyId) {
    throw new Error("[EventAutomations] companyId is required — skipping to prevent cross-tenant query");
  }
  console.log(`⏰ Checking event-based automations for company ${companyId}...`);
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

    console.log(`[Event Automations] Found ${rules.length} active rules.`);

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

    console.log(`[Event Automations] ${unexecutedRules.length} rules to execute.`);

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
              console.log(`[Event Automations] Rule ${rule.id} already claimed by another worker, skipping.`);
              return;
            }
            throw createErr;
          }

          console.log(
            `[Event Automations] 🔔 Triggering rule ${rule.id} (Type: ${rule.actionType}) for event ${rule.calendarEvent!.title}`,
          );

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
            console.log(`[Event Automations] ✅ Rule ${rule.id} executed successfully.`);
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
            } catch (cleanupErr) { console.error(`[Event Automations] Cleanup failed for rule ${rule.id}:`, cleanupErr); }
            throw execErr;
          }
        }),
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          console.error(
            `[Event Automations] ❌ Error processing rule ${batch[j].id}:`,
            (results[j] as PromiseRejectedResult).reason,
          );
        }
      }
    }

    // Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= unexecutedRules.length * 0.5) {
      throw new Error(`[Event Automations] ${totalFailures}/${unexecutedRules.length} event rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    console.error("Error processing event automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}
