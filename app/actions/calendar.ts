"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getCalendarEvents() {
  try {
    const events = await prisma.calendarEvent.findMany();
    return { success: true, data: events };
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return { success: false, error: "Failed to fetch calendar events" };
  }
}

export async function getCalendarEventById(id: string) {
  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id },
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
    const event = await prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        color: data.color,
      },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

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

    return { success: true, data: event };
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return { success: false, error: "Failed to update calendar event" };
  }
}

export async function deleteCalendarEvent(id: string) {
  try {
    await prisma.calendarEvent.delete({
      where: { id },
    });

    revalidatePath("/calendar");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return { success: false, error: "Failed to delete calendar event" };
  }
}
