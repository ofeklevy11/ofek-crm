import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/meeting-slots";
import { withMetrics } from "@/lib/with-metrics";
import { SECURE_TOKEN_RE } from "@/lib/crypto-tokens";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

// Default schedule: Sun-Thu 09:00-17:00, Fri-Sat off
const DEFAULT_SCHEDULE: Record<string, { start: string; end: string }[]> = {
  "0": [{ start: "09:00", end: "17:00" }], // Sun
  "1": [{ start: "09:00", end: "17:00" }], // Mon
  "2": [{ start: "09:00", end: "17:00" }], // Tue
  "3": [{ start: "09:00", end: "17:00" }], // Wed
  "4": [{ start: "09:00", end: "17:00" }], // Thu
  "5": [],                                  // Fri
  "6": [],                                  // Sat
};

/** Max date range: 90 days in ms */
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!SECURE_TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rate limit by IP
  const ip = getClientIp(request);
  const rateLimited = await checkRateLimit(ip, RATE_LIMITS.publicSlots);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 },
    );
  }

  const dateStart = new Date(startParam);
  const dateEnd = new Date(endParam);

  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Validate date range: end must be after start, max 90 days
  if (dateEnd.getTime() <= dateStart.getTime()) {
    return NextResponse.json({ error: "end must be after start" }, { status: 400 });
  }
  if (dateEnd.getTime() - dateStart.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Date range cannot exceed 90 days" }, { status: 400 });
  }

  // Extend dateEnd to cover the full day (clients send same date for single-day queries)
  dateEnd.setUTCHours(23, 59, 59, 999);

  const meetingType = await prisma.meetingType.findFirst({
    where: { shareToken: token, isActive: true },
    select: {
      id: true,
      companyId: true,
      duration: true,
      bufferBefore: true,
      bufferAfter: true,
      dailyLimit: true,
      minAdvanceHours: true,
      maxAdvanceDays: true,
      availabilityOverride: true,
    },
  });

  if (!meetingType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Load company availability, blocks, existing meetings, and calendar events in parallel
  const [companyAvailability, blocks, existingMeetings, existingEvents] =
    await Promise.all([
      prisma.companyAvailability.findUnique({
        where: { companyId: meetingType.companyId },
        select: { weeklySchedule: true, timezone: true },
      }),
      prisma.availabilityBlock.findMany({
        where: {
          companyId: meetingType.companyId,
          startDate: { lte: dateEnd },
          endDate: { gte: dateStart },
        },
        select: { startDate: true, endDate: true, allDay: true },
      }),
      prisma.meeting.findMany({
        where: {
          companyId: meetingType.companyId,
          status: { not: "CANCELLED" },
          startTime: { lte: dateEnd },
          endTime: { gte: dateStart },
        },
        select: {
          startTime: true,
          endTime: true,
          meetingType: { select: { bufferBefore: true, bufferAfter: true } },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          companyId: meetingType.companyId,
          startTime: { lte: dateEnd },
          endTime: { gte: dateStart },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

  // Build meetings-per-day count
  const meetingsPerDay: Record<string, number> = {};
  for (const m of existingMeetings) {
    const dayStr = m.startTime.toISOString().slice(0, 10);
    meetingsPerDay[dayStr] = (meetingsPerDay[dayStr] || 0) + 1;
  }

  // Determine weekly schedule: meetingType override > company availability > default
  const weeklySchedule = (
    meetingType.availabilityOverride
      ? meetingType.availabilityOverride
      : companyAvailability?.weeklySchedule ?? DEFAULT_SCHEDULE
  ) as Record<string, { start: string; end: string }[]>;

  const timezone = companyAvailability?.timezone ?? "Asia/Jerusalem";

  // Wrap slot computation in a timeout to prevent abuse with edge-case queries
  const SLOT_TIMEOUT_MS = 5_000;
  const slotsPromise = Promise.resolve(
    getAvailableSlots({
      weeklySchedule,
      timezone,
      duration: meetingType.duration,
      bufferBefore: meetingType.bufferBefore,
      bufferAfter: meetingType.bufferAfter,
      dailyLimit: meetingType.dailyLimit,
      minAdvanceHours: meetingType.minAdvanceHours,
      maxAdvanceDays: meetingType.maxAdvanceDays,
      dateStart,
      dateEnd,
      blocks,
      existingMeetings: existingMeetings.map((m) => ({
        startTime: m.startTime,
        endTime: m.endTime,
        bufferBefore: m.meetingType.bufferBefore,
        bufferAfter: m.meetingType.bufferAfter,
      })),
      existingEvents,
      meetingsPerDay,
    })
  );
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("SLOT_TIMEOUT")), SLOT_TIMEOUT_MS)
  );

  let slots: Record<string, unknown[]>;
  try {
    slots = await Promise.race([slotsPromise, timeoutPromise]) as Record<string, unknown[]>;
  } catch (err: any) {
    if (err?.message === "SLOT_TIMEOUT") {
      return NextResponse.json({ error: "Slot computation timed out" }, { status: 503 });
    }
    throw err;
  }

  const flatSlots = Object.values(slots).flat();

  const response = NextResponse.json({ slots: flatSlots });
  response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  return response;
}

export const GET = withMetrics("/api/p/meetings/[token]/slots", handleGET);
