"use server";

import { prisma } from "@/lib/prisma";
import { executeRuleActions } from "./automations-core";
import { revalidatePath } from "next/cache";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateActionConfigSize, MAX_TITLE_LENGTH } from "@/lib/calendar-validation";
import { createLogger } from "@/lib/logger";
import { checkCategoryLimitAndCreate } from "@/lib/automation-limit-check";

const log = createLogger("EventAutomations");

// --- Types ---

interface EventAutomationData {
  eventId: string;
  minutesBefore: number;
  actionType: string;
  actionConfig: any;
  name?: string;
}

const VALID_ACTION_TYPES = new Set([
  "SEND_NOTIFICATION",
  "SEND_WHATSAPP",
  "SEND_EMAIL",
  "CREATE_TASK",
  "UPDATE_RECORD_FIELD",
]);

function validateAutomationInput(data: { minutesBefore: number; actionType: string; actionConfig: any; name?: string }): string | null {
  if (typeof data.minutesBefore !== "number" || !Number.isFinite(data.minutesBefore) || data.minutesBefore < 0 || data.minutesBefore > 43200) {
    return "minutesBefore must be a number between 0 and 43200 (30 days)";
  }
  if (!data.actionType || typeof data.actionType !== "string" || !VALID_ACTION_TYPES.has(data.actionType)) {
    return "Invalid action type";
  }
  if (data.actionConfig !== undefined && data.actionConfig !== null && !validateActionConfigSize(data.actionConfig)) {
    return "Action configuration is too large";
  }
  if (data.name !== undefined && data.name !== null) {
    if (typeof data.name !== "string") {
      return `Name must be a string under ${MAX_TITLE_LENGTH} characters`;
    }
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_TITLE_LENGTH) {
      return `Name must be a non-empty string under ${MAX_TITLE_LENGTH} characters`;
    }
  }
  return null;
}

function validateEventId(id: unknown): boolean {
  return typeof id === "string" && id.length > 0 && id.length <= 30;
}

function validateRuleId(id: unknown): boolean {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
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
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

    let finalActionConfig = data.actionConfig;
    if (
      data.actionType === "SEND_NOTIFICATION" &&
      !finalActionConfig.recipientId
    ) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    // Plan-based per-category limit (atomic transaction)
    const userTier = (currentUser as any).isPremium || "basic";
    const result = await checkCategoryLimitAndCreate(
      currentUser.companyId,
      userTier,
      "EVENT_TIME",
      {
        companyId: currentUser.companyId,
        name:
          data.name ||
          `אוטומציה קבועה לאירועים (${data.minutesBefore} דקות לפני)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
        calendarEventId: null,
        createdBy: currentUser.id,
      },
    );

    if (!result.allowed) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.rule };
  } catch (error) {
    log.error("Error creating global event automation", { error: String(error) });
    return { success: false, error: "Failed to create global automation" };
  }
}

export async function getGlobalEventAutomations() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

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
    log.error("Error fetching global automations", { error: String(error) });
    return { success: false, error: "Failed to fetch global automations" };
  }
}

export async function updateGlobalEventAutomation(
  data: Omit<EventAutomationData, "eventId"> & { id: number },
) {
  try {
    if (!validateRuleId(data.id))
      return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

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
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
      },
      select: { id: true },
    });

    return { success: true, data: rule };
  } catch (error) {
    log.error("Error updating global event automation", { error: String(error) });
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
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

    if (!data.eventId || !validateEventId(data.eventId)) return { success: false, error: "Invalid event ID" };

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

    // Plan-based per-category limit (atomic transaction)
    const userTier = (currentUser as any).isPremium || "basic";
    const result = await checkCategoryLimitAndCreate(
      currentUser.companyId,
      userTier,
      "EVENT_TIME",
      {
        companyId: currentUser.companyId,
        name: data.name || `אוטומציה לאירוע (${data.minutesBefore} דקות לפני)`,
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: data.minutesBefore },
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
        calendarEventId: data.eventId,
        createdBy: currentUser.id,
      },
    );

    if (!result.allowed) {
      return { success: false, error: result.error };
    }

    revalidatePath("/calendar");
    return { success: true, data: result.rule };
  } catch (error) {
    log.error("Error creating event automation", { error: String(error) });
    return { success: false, error: "Failed to create automation" };
  }
}

export async function getEventAutomations(eventId: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    if (!validateEventId(eventId))
      return { success: false, error: "Invalid event ID" };

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
    log.error("Error fetching event automations", { error: String(error) });
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
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const count = await queryMaxEventAutomationCount(currentUser.companyId);
    return { success: true, count };
  } catch (error) {
    log.error("Error fetching max event automation count", { error: String(error) });
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
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const safeEventId = eventId && validateEventId(eventId) ? eventId : undefined;

    const [eventAutomations, globalAutomationCount] = await Promise.all([
      safeEventId
        ? prisma.automationRule.findMany({
            where: { calendarEventId: safeEventId, companyId: currentUser.companyId },
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
    log.error("Error fetching event modal init data", { error: String(error) });
    return { success: false, error: "Failed to fetch modal data" };
  }
}

export async function getGlobalAutomationsModalData() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

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
    log.error("Error fetching global automations modal data", { error: String(error) });
    return { success: false, error: "Failed to fetch modal data" };
  }
}

export async function updateEventAutomation(
  data: Omit<EventAutomationData, "eventId"> & { id: number },
) {
  try {
    if (!validateRuleId(data.id))
      return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

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
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
      },
      select: { id: true },
    });

    revalidatePath("/calendar");
    return { success: true, data: rule };
  } catch (error) {
    log.error("Error updating event automation", { error: String(error) });
    return { success: false, error: "Failed to update automation" };
  }
}

export async function deleteEventAutomation(ruleId: number) {
  try {
    if (!validateRuleId(ruleId))
      return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser)
      return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewCalendar"))
      return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    await prisma.automationRule.delete({
      where: { id: ruleId, companyId: currentUser.companyId },
    });

    revalidatePath("/calendar");
    return { success: true };
  } catch (error) {
    log.error("Error deleting event automation", { error: String(error) });
    return { success: false, error: "Failed to delete automation" };
  }
}

