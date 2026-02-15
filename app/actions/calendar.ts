"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { createCalendarEventForCompany } from "@/lib/calendar-helpers";

export async function getCalendarEvents(rangeStart?: string, rangeEnd?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const where: { companyId: number; startTime?: { lte: Date }; endTime?: { gte: Date } } = {
      companyId: user.companyId,
    };

    if (rangeStart && rangeEnd) {
      where.startTime = { lte: new Date(rangeEnd) };
      where.endTime = { gte: new Date(rangeStart) };
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
    console.error("Error fetching calendar events:", error);
    return { success: false, error: "Failed to fetch calendar events" };
  }
}

export async function getCalendarEventById(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // CRITICAL: Filter by companyId
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
    console.error("Error fetching calendar event:", error);
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

    const event = await createCalendarEventForCompany(
      user.companyId,
      user.id,
      {
        title: data.title,
        description: data.description,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        color: data.color,
      },
    );

    return { success: true, data: event };
  } catch (error) {
    console.error("Error creating calendar event:", error);
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

    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.startTime !== undefined)
      updateData.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
    if (data.color !== undefined) updateData.color = data.color;

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
    console.error("Error updating calendar event:", error);
    return { success: false, error: "Failed to update calendar event" };
  }
}

export async function deleteCalendarEvent(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
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
    console.error("Error deleting calendar event:", error);
    return { success: false, error: "Failed to delete calendar event" };
  }
}
