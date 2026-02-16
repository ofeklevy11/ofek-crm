import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { updateCalendarEvent, deleteCalendarEvent } from "@/app/actions/calendar";
import { validateCalendarEventUpdate } from "@/lib/calendar-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("CalendarItemAPI");

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit is enforced in the server action (updateCalendarEvent) to avoid double-counting
    const { id } = await params;

    // Validate id format (cuid is 25 alphanumeric chars)
    if (!id || typeof id !== "string" || id.length > 30) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateCalendarEventUpdate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const updateData: {
      title?: string;
      description?: string;
      startTime?: string;
      endTime?: string;
      color?: string;
    } = {};

    if (validation.data.title !== undefined) updateData.title = validation.data.title;
    if (validation.data.description !== undefined) updateData.description = validation.data.description;
    if (validation.data.startTime) updateData.startTime = validation.data.startTime.toISOString();
    if (validation.data.endTime) updateData.endTime = validation.data.endTime.toISOString();
    if (validation.data.color !== undefined) updateData.color = validation.data.color;

    const result = await updateCalendarEvent(id, updateData);

    if (!result.success) {
      const status = result.error === "Event not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    log.error("Failed to update calendar event", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update calendar event" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit is enforced in the server action (deleteCalendarEvent) to avoid double-counting
    const { id } = await params;

    if (!id || typeof id !== "string" || id.length > 30) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const result = await deleteCalendarEvent(id);

    if (!result.success) {
      const status = result.error === "Event not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete calendar event", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete calendar event" },
      { status: 500 }
    );
  }
}
