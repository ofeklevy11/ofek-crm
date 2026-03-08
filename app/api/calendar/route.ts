import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createCalendarEvent } from "@/app/actions/calendar";
import { validateCalendarEventInput } from "@/lib/calendar-validation";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("CalendarAPI");

async function handleGET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.calendarRead);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const rangeStart = searchParams.get("rangeStart");
    const rangeEnd = searchParams.get("rangeEnd");

    // Validate date params if provided
    if (rangeStart && isNaN(new Date(rangeStart).getTime())) {
      return NextResponse.json({ error: "Invalid rangeStart date" }, { status: 400 });
    }
    if (rangeEnd && isNaN(new Date(rangeEnd).getTime())) {
      return NextResponse.json({ error: "Invalid rangeEnd date" }, { status: 400 });
    }

    // Query DB directly — auth already validated above, avoids double auth/rate-limit
    const where: { companyId: number; startTime?: { lte: Date }; endTime?: { gte: Date } } = {
      companyId: user.companyId,
    };

    if (rangeStart && rangeEnd) {
      const rangeStartDate = new Date(rangeStart);
      const rangeEndDate = new Date(rangeEnd);
      const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
      if (rangeEndDate.getTime() - rangeStartDate.getTime() > MAX_RANGE_MS) {
        return NextResponse.json({ error: "Date range cannot exceed 1 year" }, { status: 400 });
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
      take: (rangeStart && rangeEnd) ? 500 : 2000,
    });

    return NextResponse.json(events);
  } catch (error) {
    log.error("Failed to fetch calendar events", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewCalendar")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit is enforced in the server action (createCalendarEvent) to avoid double-counting
    const body = await request.json();
    const validation = validateCalendarEventInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = await createCalendarEvent({
      title: validation.data.title,
      description: validation.data.description,
      startTime: validation.data.startTime.toISOString(),
      endTime: validation.data.endTime.toISOString(),
      color: validation.data.color,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    log.error("Failed to create calendar event", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/calendar", handleGET);
export const POST = withMetrics("/api/calendar", handlePOST);
