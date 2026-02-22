"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("Availability");

// ============================================
// COMPANY AVAILABILITY (weekly schedule)
// ============================================

export async function getCompanyAvailability() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    let availability = await prisma.companyAvailability.findUnique({
      where: { companyId: user.companyId },
    });

    // Return default schedule if none exists
    if (!availability) {
      const defaultSchedule = {
        "0": [{ start: "09:00", end: "17:00" }], // Sunday
        "1": [{ start: "09:00", end: "17:00" }], // Monday
        "2": [{ start: "09:00", end: "17:00" }], // Tuesday
        "3": [{ start: "09:00", end: "17:00" }], // Wednesday
        "4": [{ start: "09:00", end: "17:00" }], // Thursday
        "5": [], // Friday - off
        "6": [], // Saturday - off
      };
      return {
        success: true,
        data: {
          id: 0,
          companyId: user.companyId,
          weeklySchedule: defaultSchedule,
          timezone: "Asia/Jerusalem",
        },
      };
    }

    return { success: true, data: availability };
  } catch (error) {
    log.error("Error fetching company availability", { error: String(error) });
    return { success: false, error: "Failed to fetch availability" };
  }
}

export async function updateCompanyAvailability(data: {
  weeklySchedule: Record<string, { start: string; end: string }[]>;
  timezone?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    // Validate weekly schedule structure
    if (!data.weeklySchedule || typeof data.weeklySchedule !== "object") {
      return { success: false, error: "לוח זמנים שבועי נדרש" };
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    for (const [day, windows] of Object.entries(data.weeklySchedule)) {
      if (!["0", "1", "2", "3", "4", "5", "6"].includes(day)) {
        return { success: false, error: `יום לא תקין: ${day}` };
      }
      if (!Array.isArray(windows)) {
        return { success: false, error: `חלונות זמן חייבים להיות מערך ליום ${day}` };
      }
      for (const w of windows) {
        if (!w.start || !w.end || !timeRegex.test(w.start) || !timeRegex.test(w.end)) {
          return { success: false, error: `פורמט שעה לא תקין ביום ${day}` };
        }
        if (w.start >= w.end) {
          return { success: false, error: `שעת סיום חייבת להיות אחרי שעת התחלה ביום ${day}` };
        }
      }
    }

    const availability = await prisma.companyAvailability.upsert({
      where: { companyId: user.companyId },
      update: {
        weeklySchedule: data.weeklySchedule,
        timezone: data.timezone || "Asia/Jerusalem",
      },
      create: {
        companyId: user.companyId,
        weeklySchedule: data.weeklySchedule,
        timezone: data.timezone || "Asia/Jerusalem",
      },
    });

    revalidatePath("/meetings");
    return { success: true, data: availability };
  } catch (error) {
    log.error("Error updating company availability", { error: String(error) });
    return { success: false, error: "Failed to update availability" };
  }
}

// ============================================
// AVAILABILITY BLOCKS
// ============================================

export async function getAvailabilityBlocks(start?: string, end?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const where: any = { companyId: user.companyId };

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { success: false, error: "תאריכים לא תקינים" };
      }
      where.startDate = { lte: endDate };
      where.endDate = { gte: startDate };
    }

    const blocks = await prisma.availabilityBlock.findMany({
      where,
      orderBy: { startDate: "asc" },
      take: 200,
    });

    return { success: true, data: blocks };
  } catch (error) {
    log.error("Error fetching availability blocks", { error: String(error) });
    return { success: false, error: "Failed to fetch availability blocks" };
  }
}

export async function createAvailabilityBlock(data: {
  title?: string;
  startDate: string;
  endDate: string;
  allDay?: boolean;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: false, error: "תאריכים לא תקינים" };
    }
    if (endDate <= startDate) {
      return { success: false, error: "תאריך סיום חייב להיות אחרי תאריך התחלה" };
    }

    if (data.title && data.title.length > 200) {
      return { success: false, error: "כותרת ארוכה מדי" };
    }

    const block = await prisma.availabilityBlock.create({
      data: {
        companyId: user.companyId,
        title: data.title?.trim() || null,
        startDate,
        endDate,
        allDay: data.allDay ?? true,
      },
    });

    revalidatePath("/meetings");
    return { success: true, data: block };
  } catch (error) {
    log.error("Error creating availability block", { error: String(error) });
    return { success: false, error: "Failed to create availability block" };
  }
}

export async function deleteAvailabilityBlock(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    await prisma.availabilityBlock.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath("/meetings");
    return { success: true };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "חסימה לא נמצאה" };
    log.error("Error deleting availability block", { error: String(error) });
    return { success: false, error: "Failed to delete availability block" };
  }
}
