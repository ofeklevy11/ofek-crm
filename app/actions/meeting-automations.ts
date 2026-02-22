"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateActionConfigSize, MAX_TITLE_LENGTH } from "@/lib/calendar-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("MeetingAutomations");

// Tier-based limits for total meeting automations (global + per-meeting combined)
const MEETING_AUTOMATION_LIMITS: Record<string, number> = {
  basic: 2,
  premium: 6,
  super: Infinity,
};

// Helper to format date for Hebrew display
function formatDateHe(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatTimeHe(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" });
}

const VALID_ACTION_TYPES = new Set([
  "SEND_NOTIFICATION",
  "SEND_WHATSAPP",
  "CREATE_TASK",
  "UPDATE_RECORD_FIELD",
  "WEBHOOK",
  "CALCULATE_DURATION",
]);

const VALID_TRIGGER_TYPES = new Set([
  "MEETING_BOOKED",
  "MEETING_CANCELLED",
  "MEETING_REMINDER",
]);

function validateAutomationInput(data: { triggerType: string; minutesBefore?: number; actionType: string; actionConfig: any; name?: string }): string | null {
  if (!data.triggerType || !VALID_TRIGGER_TYPES.has(data.triggerType)) {
    return "סוג טריגר לא תקין";
  }
  if (data.triggerType === "MEETING_REMINDER") {
    if (typeof data.minutesBefore !== "number" || !Number.isFinite(data.minutesBefore) || data.minutesBefore < 0 || data.minutesBefore > 43200) {
      return "minutesBefore חייב להיות מספר בין 0 ל-43200";
    }
  }
  if (!data.actionType || !VALID_ACTION_TYPES.has(data.actionType)) {
    return "סוג פעולה לא תקין";
  }
  if (data.actionConfig !== undefined && data.actionConfig !== null && !validateActionConfigSize(data.actionConfig)) {
    return "הגדרות הפעולה גדולות מדי";
  }
  if (data.name !== undefined && data.name !== null) {
    if (typeof data.name !== "string" || data.name.trim().length === 0 || data.name.trim().length > MAX_TITLE_LENGTH) {
      return `שם חייב להיות עד ${MAX_TITLE_LENGTH} תווים`;
    }
  }
  return null;
}

// ============================================
// USAGE QUERY
// ============================================

export async function getMeetingAutomationUsage(meetingId?: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };

    const userPlan = currentUser.isPremium || "basic";
    const limit = MEETING_AUTOMATION_LIMITS[userPlan] ?? 2;

    const globalCount = await prisma.automationRule.count({
      where: {
        companyId: currentUser.companyId,
        triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
        meetingId: null,
      },
    });

    // When meetingId is provided, count only THAT meeting's per-meeting automations
    // When not provided (global modal), perMeetingCount = 0
    const perMeetingCount = meetingId
      ? await prisma.automationRule.count({
          where: {
            companyId: currentUser.companyId,
            triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
            meetingId,
          },
        })
      : 0;

    const total = globalCount + perMeetingCount;

    return {
      success: true,
      data: { globalCount, perMeetingCount, total, limit, userPlan },
    };
  } catch (error) {
    log.error("Error fetching meeting automation usage", { error: String(error) });
    return { success: false, error: "Failed to fetch usage" };
  }
}

// ============================================
// GLOBAL MEETING AUTOMATIONS
// ============================================

export async function createGlobalMeetingAutomation(data: {
  triggerType: string;
  minutesBefore?: number;
  actionType: string;
  actionConfig: any;
  name?: string;
  meetingTypeId?: number;
}) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    // Tier-based limit check: global automations only count against global creation
    const userPlan = currentUser.isPremium || "basic";
    const tierLimit = MEETING_AUTOMATION_LIMITS[userPlan] ?? 2;
    if (tierLimit !== Infinity) {
      const globalCount = await prisma.automationRule.count({
        where: {
          companyId: currentUser.companyId,
          triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
          meetingId: null,
        },
      });
      if (globalCount >= tierLimit) {
        return { success: false, error: `הגעת למגבלת האוטומציות לפגישות (${tierLimit}). שדרג את התוכנית להוספת אוטומציות נוספות.` };
      }
    }

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

    let finalActionConfig = data.actionConfig;
    if (data.actionType === "SEND_NOTIFICATION" && !finalActionConfig?.recipientId) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const triggerConfig: any = {};
    if (data.minutesBefore !== undefined) triggerConfig.minutesBefore = data.minutesBefore;
    if (data.meetingTypeId) triggerConfig.meetingTypeId = data.meetingTypeId;

    const rule = await prisma.automationRule.create({
      data: {
        companyId: currentUser.companyId,
        name: data.name || `אוטומציה קבועה לפגישות - ${data.triggerType}`,
        triggerType: data.triggerType as any,
        triggerConfig,
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
        meetingTypeId: data.meetingTypeId || null,
        createdBy: currentUser.id,
      },
      select: { id: true },
    });

    return { success: true, data: rule };
  } catch (error) {
    log.error("Error creating global meeting automation", { error: String(error) });
    return { success: false, error: "Failed to create automation" };
  }
}

export async function getGlobalMeetingAutomations() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: currentUser.companyId,
        triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
        meetingId: null,
      },
      select: {
        id: true,
        name: true,
        triggerType: true,
        triggerConfig: true,
        actionType: true,
        actionConfig: true,
        meetingTypeId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return { success: true, data: rules };
  } catch (error) {
    log.error("Error fetching global meeting automations", { error: String(error) });
    return { success: false, error: "Failed to fetch automations" };
  }
}

export async function updateGlobalMeetingAutomation(data: {
  id: number;
  triggerType: string;
  minutesBefore?: number;
  actionType: string;
  actionConfig: any;
  name?: string;
  meetingTypeId?: number;
}) {
  try {
    if (!Number.isInteger(data.id) || data.id <= 0) return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

    let finalActionConfig = data.actionConfig;
    if (data.actionType === "SEND_NOTIFICATION" && !finalActionConfig?.recipientId) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const triggerConfig: any = {};
    if (data.minutesBefore !== undefined) triggerConfig.minutesBefore = data.minutesBefore;
    if (data.meetingTypeId) triggerConfig.meetingTypeId = data.meetingTypeId;

    const rule = await prisma.automationRule.update({
      where: { id: data.id, companyId: currentUser.companyId },
      data: {
        name: data.name || `אוטומציה קבועה לפגישות - ${data.triggerType}`,
        triggerType: data.triggerType as any,
        triggerConfig,
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
        meetingTypeId: data.meetingTypeId || null,
      },
      select: { id: true },
    });

    return { success: true, data: rule };
  } catch (error) {
    log.error("Error updating global meeting automation", { error: String(error) });
    return { success: false, error: "Failed to update automation" };
  }
}

export async function deleteGlobalMeetingAutomation(id: number) {
  try {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    await prisma.automationRule.delete({
      where: { id, companyId: currentUser.companyId },
    });

    return { success: true };
  } catch (error) {
    log.error("Error deleting global meeting automation", { error: String(error) });
    return { success: false, error: "Failed to delete automation" };
  }
}

// ============================================
// PER-MEETING AUTOMATIONS
// ============================================

const PER_MEETING_TRIGGERS = new Set(["MEETING_REMINDER", "MEETING_CANCELLED"]);
const MAX_PER_MEETING_AUTOMATIONS = 10;

export async function createPerMeetingAutomation(data: {
  meetingId: string;
  triggerType: string;
  minutesBefore?: number;
  actionType: string;
  actionConfig: any;
  name?: string;
}) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    // Tier-based limit check: global + THIS meeting's per-meeting automations
    const userPlan = currentUser.isPremium || "basic";
    const tierLimit = MEETING_AUTOMATION_LIMITS[userPlan] ?? 2;
    if (tierLimit !== Infinity) {
      const [globalCount, thisMeetingCount] = await Promise.all([
        prisma.automationRule.count({
          where: {
            companyId: currentUser.companyId,
            triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
            meetingId: null,
          },
        }),
        prisma.automationRule.count({
          where: {
            companyId: currentUser.companyId,
            triggerType: { in: ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] },
            meetingId: data.meetingId,
          },
        }),
      ]);
      if (globalCount + thisMeetingCount >= tierLimit) {
        return { success: false, error: `הגעת למגבלת האוטומציות לפגישות (${tierLimit}). שדרג את התוכנית להוספת אוטומציות נוספות.` };
      }
    }

    if (!data.triggerType || !PER_MEETING_TRIGGERS.has(data.triggerType)) {
      return { success: false, error: "סוג טריגר לא תקין לאוטומציה לפגישה" };
    }

    const validationError = validateAutomationInput(data);
    if (validationError) return { success: false, error: validationError };

    const meeting = await prisma.meeting.findFirst({
      where: { id: data.meetingId, companyId: currentUser.companyId },
      select: { id: true, status: true },
    });
    if (!meeting) return { success: false, error: "פגישה לא נמצאה" };
    if (meeting.status === "CANCELLED" || meeting.status === "COMPLETED") {
      return { success: false, error: "לא ניתן להוסיף אוטומציה לפגישה שהושלמה או בוטלה" };
    }

    const count = await prisma.automationRule.count({
      where: { meetingId: data.meetingId, companyId: currentUser.companyId },
    });
    if (count >= MAX_PER_MEETING_AUTOMATIONS) {
      return { success: false, error: `מותר עד ${MAX_PER_MEETING_AUTOMATIONS} אוטומציות לפגישה` };
    }

    let finalActionConfig = data.actionConfig;
    if (data.actionType === "SEND_NOTIFICATION" && !finalActionConfig?.recipientId) {
      finalActionConfig = { ...finalActionConfig, recipientId: currentUser.id };
    }

    const triggerConfig: any = {};
    if (data.minutesBefore !== undefined) triggerConfig.minutesBefore = data.minutesBefore;

    const rule = await prisma.automationRule.create({
      data: {
        companyId: currentUser.companyId,
        name: data.name || `אוטומציה לפגישה - ${data.triggerType}`,
        triggerType: data.triggerType as any,
        triggerConfig,
        actionType: data.actionType as any,
        actionConfig: finalActionConfig,
        meetingId: data.meetingId,
        createdBy: currentUser.id,
      },
      select: { id: true },
    });

    return { success: true, data: rule };
  } catch (error) {
    log.error("Error creating per-meeting automation", { error: String(error) });
    return { success: false, error: "Failed to create automation" };
  }
}

export async function getPerMeetingAutomations(meetingId: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: currentUser.companyId,
        meetingId,
      },
      select: {
        id: true,
        name: true,
        triggerType: true,
        triggerConfig: true,
        actionType: true,
        actionConfig: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PER_MEETING_AUTOMATIONS,
    });

    return { success: true, data: rules };
  } catch (error) {
    log.error("Error fetching per-meeting automations", { error: String(error) });
    return { success: false, error: "Failed to fetch automations" };
  }
}

export async function deletePerMeetingAutomation(id: number) {
  try {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid rule ID" };

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    if (!hasUserFlag(currentUser, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    // Verify it's a per-meeting rule belonging to this company
    const rule = await prisma.automationRule.findFirst({
      where: { id, companyId: currentUser.companyId, meetingId: { not: null } },
      select: { id: true },
    });
    if (!rule) return { success: false, error: "אוטומציה לא נמצאה" };

    await prisma.automationRule.delete({ where: { id } });

    return { success: true };
  } catch (error) {
    log.error("Error deleting per-meeting automation", { error: String(error) });
    return { success: false, error: "Failed to delete automation" };
  }
}

// ============================================
// FIRE MEETING AUTOMATIONS (called from booking/cancellation flows)
// ============================================

/**
 * Fire all matching automations for a meeting event (MEETING_BOOKED or MEETING_CANCELLED).
 * Called fire-and-forget from booking/cancellation flows.
 */
export async function fireMeetingAutomations(
  companyId: number,
  triggerType: "MEETING_BOOKED" | "MEETING_CANCELLED",
  meeting: {
    id: string;
    meetingTypeId: number;
    participantName: string;
    participantEmail?: string | null;
    participantPhone?: string | null;
    startTime: Date;
    endTime: Date;
    meetingTypeName: string;
  },
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId,
        triggerType,
        isActive: true,
        OR: [
          { meetingTypeId: null, meetingId: null },
          { meetingTypeId: meeting.meetingTypeId, meetingId: null },
          { meetingId: meeting.id },
        ],
      },
      take: 50,
    });

    if (rules.length === 0) return;

    const { executeRuleActions } = await import("@/app/actions/automations-core");

    const meetingContext = {
      meetingId: meeting.id,
      participantName: meeting.participantName,
      participantEmail: meeting.participantEmail || undefined,
      participantPhone: meeting.participantPhone || undefined,
      meetingType: meeting.meetingTypeName,
      meetingStart: `${formatDateHe(meeting.startTime)} ${formatTimeHe(meeting.startTime)}`,
      meetingEnd: `${formatDateHe(meeting.endTime)} ${formatTimeHe(meeting.endTime)}`,
    };

    for (const rule of rules) {
      try {
        await executeRuleActions(rule, meetingContext);
      } catch (err) {
        log.error("Error executing meeting automation rule", { ruleId: rule.id, error: String(err) });
      }
    }
  } catch (error) {
    log.error("Error firing meeting automations", { companyId, triggerType, error: String(error) });
  }
}

// ============================================
// MEETING_REMINDER PROCESSING (called from cron)
// ============================================

/**
 * Process MEETING_REMINDER automations for all companies.
 * Finds upcoming meetings that match reminder rules (startTime - minutesBefore <= now)
 * and haven't been processed yet (using AutomationLog for dedup).
 */
export async function processMeetingReminders() {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        triggerType: "MEETING_REMINDER",
        isActive: true,
      },
      take: 500,
    });

    if (rules.length === 0) return;

    const { executeRuleActions } = await import("@/app/actions/automations-core");
    const now = new Date();

    for (const rule of rules) {
      try {
        const minutesBefore = (rule.triggerConfig as any)?.minutesBefore ?? 30;
        const reminderThreshold = new Date(now.getTime() + minutesBefore * 60_000);

        // Find upcoming meetings within the reminder window that haven't been reminded yet
        const meetings = await prisma.meeting.findMany({
          where: {
            companyId: rule.companyId,
            status: { in: ["PENDING", "CONFIRMED"] },
            startTime: { gt: now, lte: reminderThreshold },
            ...(rule.meetingTypeId ? { meetingTypeId: rule.meetingTypeId } : {}),
            ...((rule as any).meetingId ? { id: (rule as any).meetingId } : {}),
          },
          include: { meetingType: { select: { name: true } } },
          take: 100,
        });

        for (const meeting of meetings) {
          // Dedup: check if we already logged a reminder for this rule + this meeting's calendar event
          if (meeting.calendarEventId) {
            const existing = await prisma.automationLog.findUnique({
              where: {
                automationRuleId_calendarEventId: {
                  automationRuleId: rule.id,
                  calendarEventId: meeting.calendarEventId,
                },
              },
              select: { id: true },
            });
            if (existing) continue;
          }

          // Execute the automation
          try {
            await executeRuleActions(rule, {
              meetingId: meeting.id,
              participantName: meeting.participantName,
              participantEmail: meeting.participantEmail || undefined,
              participantPhone: meeting.participantPhone || undefined,
              meetingType: meeting.meetingType.name,
              meetingStart: `${formatDateHe(meeting.startTime)} ${formatTimeHe(meeting.startTime)}`,
              meetingEnd: `${formatDateHe(meeting.endTime)} ${formatTimeHe(meeting.endTime)}`,
            });

            // Log for dedup using the meeting's linked calendarEventId
            if (meeting.calendarEventId) {
              await prisma.automationLog.create({
                data: {
                  automationRuleId: rule.id,
                  companyId: rule.companyId,
                  calendarEventId: meeting.calendarEventId,
                },
              });
            }
          } catch (execErr) {
            log.error("Error executing meeting reminder", { ruleId: rule.id, meetingId: meeting.id, error: String(execErr) });
          }
        }
      } catch (ruleErr) {
        log.error("Error processing meeting reminder rule", { ruleId: rule.id, error: String(ruleErr) });
      }
    }
  } catch (error) {
    log.error("Error in processMeetingReminders", { error: String(error) });
  }
}
