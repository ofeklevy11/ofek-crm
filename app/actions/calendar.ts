"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { createCalendarEventForCompany } from "@/lib/calendar-helpers";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateCalendarEventInput,
  validateCalendarEventUpdate,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENTS_PER_COMPANY,
} from "@/lib/calendar-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Calendar");

export async function getCalendarEvents(rangeStart?: string, rangeEnd?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return { success: false, error: "Forbidden" };
    }

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.calendarRead);
    if (limited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const where: { companyId: number; startTime?: { lte: Date }; endTime?: { gte: Date } } = {
      companyId: user.companyId,
    };

    if (rangeStart && rangeEnd) {
      const rangeEndDate = new Date(rangeEnd);
      const rangeStartDate = new Date(rangeStart);
      if (isNaN(rangeStartDate.getTime()) || isNaN(rangeEndDate.getTime())) {
        return { success: false, error: "Invalid date range" };
      }
      const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
      if (rangeEndDate.getTime() - rangeStartDate.getTime() > MAX_RANGE_MS) {
        return { success: false, error: "Date range cannot exceed 1 year" };
      }
      where.startTime = { lte: rangeEndDate };
      where.endTime = { gte: rangeStartDate };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        color: true,
      },
      orderBy: { startTime: "asc" },
      take: rangeStart ? 500 : 2000,
    });
    return { success: true, data: events };
  } catch (error) {
    log.error("Error fetching calendar events", { error: String(error) });
    return { success: false, error: "Failed to fetch calendar events" };
  }
}

export async function getCalendarEventById(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return { success: false, error: "Forbidden" };
    }

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.calendarRead);
    if (limited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    if (!id || typeof id !== "string" || id.length > 30) {
      return { success: false, error: "Invalid event ID" };
    }

    const event = await prisma.calendarEvent.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        color: true,
      },
    });

    if (!event) {
      return { success: false, error: "Event not found" };
    }

    return { success: true, data: event };
  } catch (error) {
    log.error("Error fetching calendar event", { error: String(error) });
    return { success: false, error: "Failed to fetch calendar event" };
  }
}

export async function createCalendarEvent(data: {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  color?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return { success: false, error: "Forbidden" };
    }

    // Rate limit mutations
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.calendarMutation);
    if (limited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Validate input
    const validation = validateCalendarEventInput({
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      color: data.color,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Enforce per-company event limit (soft limit — TOCTOU race is bounded by rate limit to ~30 overshoot)
    const eventCount = await prisma.calendarEvent.count({
      where: { companyId: user.companyId },
    });
    if (eventCount >= MAX_EVENTS_PER_COMPANY) {
      return { success: false, error: `Event limit reached (${MAX_EVENTS_PER_COMPANY}). Please delete old events.` };
    }

    const event = await createCalendarEventForCompany(
      user.companyId,
      user.id,
      {
        title: validation.data.title,
        description: validation.data.description,
        startTime: validation.data.startTime,
        endTime: validation.data.endTime,
        color: validation.data.color,
      },
    );

    return { success: true, data: event };
  } catch (error) {
    log.error("Error creating calendar event", { error: String(error) });
    return { success: false, error: "Failed to create calendar event" };
  }
}

export async function updateCalendarEvent(
  id: string,
  data: {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    color?: string;
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return { success: false, error: "Forbidden" };
    }

    if (!id || typeof id !== "string" || id.length > 30) {
      return { success: false, error: "Invalid event ID" };
    }

    // Rate limit mutations
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.calendarMutation);
    if (limited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Validate input
    const validation = validateCalendarEventUpdate({
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      color: data.color,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const updateData: Record<string, unknown> = {};

    if (validation.data.title !== undefined) updateData.title = validation.data.title;
    if (validation.data.description !== undefined)
      updateData.description = validation.data.description;
    if (validation.data.startTime)
      updateData.startTime = validation.data.startTime;
    if (validation.data.endTime) updateData.endTime = validation.data.endTime;
    if (validation.data.color !== undefined) updateData.color = validation.data.color;

    const event = await prisma.calendarEvent.update({
      where: { id, companyId: user.companyId },
      data: updateData,
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        color: true,
      },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    return { success: true, data: event };
  } catch (error: any) {
    if (error?.code === "P2025") {
      return { success: false, error: "Event not found" };
    }
    log.error("Error updating calendar event", { error: String(error) });
    return { success: false, error: "Failed to update calendar event" };
  }
}

export async function deleteCalendarEvent(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return { success: false, error: "Forbidden" };
    }

    if (!id || typeof id !== "string" || id.length > 30) {
      return { success: false, error: "Invalid event ID" };
    }

    // Rate limit mutations
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.calendarMutation);
    if (limited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    await prisma.calendarEvent.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    return { success: true };
  } catch (error: any) {
    if (error?.code === "P2025") {
      return { success: false, error: "Event not found" };
    }
    log.error("Error deleting calendar event", { error: String(error) });
    return { success: false, error: "Failed to delete calendar event" };
  }
}
