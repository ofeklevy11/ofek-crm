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
  name?: string;
  id?: number; // For update
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
          `Global Event Automation (${data.minutesBefore}m before)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
        calendarEventId: null, // Global
        createdBy: currentUser.id,
      },
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
      orderBy: { createdAt: "desc" },
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
          `Global Event Automation (${data.minutesBefore}m before)`,
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
      },
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

    const event = await prisma.calendarEvent.findUnique({
      where: { id: data.eventId },
    });

    if (!event) return { success: false, error: "Event not found" };
    if (event.companyId !== currentUser.companyId)
      return { success: false, error: "Unauthorized" };

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
        name: data.name || `Event Automation (${data.minutesBefore}m before)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType,
        actionConfig: finalActionConfig,
        calendarEventId: data.eventId,
        createdBy: currentUser.id,
      },
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
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: rules };
  } catch (error) {
    console.error("Error fetching event automations:", error);
    return { success: false, error: "Failed to fetch event automations" };
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

export async function processEventAutomations() {
  console.log("⏰ Checking event-based automations...");
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "EVENT_TIME",
        // calendarEventId must not be null
        calendarEventId: { not: null },
      },
      include: {
        calendarEvent: true,
      },
    });

    console.log(`[Event Automations] Found ${rules.length} active rules.`);

    const now = new Date();

    for (const rule of rules) {
      if (!rule.calendarEvent) continue;

      const eventStart = new Date(rule.calendarEvent.startTime);
      const triggerConfig = rule.triggerConfig as any;
      const minutesBefore = Number(triggerConfig?.minutesBefore || 0);

      // Calculate the trigger time
      const targetTime = new Date(eventStart.getTime() - minutesBefore * 60000);

      // Check if NOW is past the target time
      // Check if NOW is past the target time
      if (now >= targetTime) {
        try {
          // Check execution log
          const executed = await prisma.automationLog.findUnique({
            where: {
              automationRuleId_calendarEventId: {
                automationRuleId: rule.id,
                calendarEventId: rule.calendarEventId as string,
              },
            },
          });

          if (!executed) {
            console.log(
              `[Event Automations] 🔔 Triggering rule ${rule.id} (Type: ${rule.actionType}) for event ${rule.calendarEvent.title}`,
            );

            // Prepare Context
            const eventRecordData = {
              title: rule.calendarEvent.title,
              description: rule.calendarEvent.description,
              start: rule.calendarEvent.startTime.toISOString(),
              end: rule.calendarEvent.endTime.toISOString(),
              // Aliases for templates
              taskTitle: rule.calendarEvent.title,
              eventTitle: rule.calendarEvent.title,
              eventStart: rule.calendarEvent.startTime.toLocaleString("he-IL"),
              eventEnd: rule.calendarEvent.endTime.toLocaleString("he-IL"),
              // Legacy support for older templates
              time: rule.calendarEvent.startTime.toLocaleString("he-IL"),
            };

            await executeRuleActions(rule, {
              recordData: eventRecordData,
              tableName: "Calendar",
              // We pass null for recordId/taskId since this is event based
            });

            // Log execution
            await prisma.automationLog.create({
              data: {
                automationRuleId: rule.id,
                calendarEventId: rule.calendarEventId as string,
              },
            });
            console.log(
              `[Event Automations] ✅ Rule ${rule.id} executed successfully.`,
            );
          }
        } catch (ruleError) {
          console.error(
            `[Event Automations] ❌ Error processing rule ${rule.id}:`,
            ruleError,
          );
        }
      }
    }
  } catch (error) {
    console.error("Error processing event automations:", error);
  }
}
