"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getCalendarEvents() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // CRITICAL: Filter by companyId
    const events = await prisma.calendarEvent.findMany({
      where: { companyId: user.companyId },
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

    const event = await prisma.calendarEvent.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId
        title: data.title,
        description: data.description,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        color: data.color,
      },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    // Trigger automations
    console.log(
      `[Calendar Actions] Created event ${event.id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import("./automations");
      // Use no args to check ALL views (including Calendar views)
      await processViewAutomations();
    } catch (autoError) {
      console.error(
        "[Calendar Actions] Failed to trigger automations:",
        autoError
      );
    }

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
  }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify ownership
    const existingEvent = await prisma.calendarEvent.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!existingEvent) {
      return { success: false, error: "Event not found" };
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
      where: { id },
      data: updateData,
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    // Trigger automations
    console.log(
      `[Calendar Actions] Updated event ${event.id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import("./automations");
      await processViewAutomations();
    } catch (autoError) {
      console.error(
        "[Calendar Actions] Failed to trigger automations:",
        autoError
      );
    }

    return { success: true, data: event };
  } catch (error) {
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

    // Verify ownership
    const existingEvent = await prisma.calendarEvent.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!existingEvent) {
      return { success: false, error: "Event not found" };
    }

    await prisma.calendarEvent.delete({
      where: { id },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    // Trigger automations
    console.log(
      `[Calendar Actions] Deleted event ${id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import("./automations");
      await processViewAutomations();
    } catch (autoError) {
      console.error(
        "[Calendar Actions] Failed to trigger automations:",
        autoError
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return { success: false, error: "Failed to delete calendar event" };
  }
}
