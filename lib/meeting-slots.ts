/**
 * Slot availability algorithm for meeting booking.
 * Generates available time slots considering:
 * - Weekly schedule (CompanyAvailability or MeetingType override)
 * - Blocked dates (AvailabilityBlock)
 * - Existing meetings with buffers
 * - Existing calendar events
 * - Daily limits, min advance hours, max advance days
 */

interface TimeWindow {
  start: string; // "09:00"
  end: string;   // "17:00"
}

/**
 * Get the UTC offset in milliseconds for a given timezone at a specific date.
 * Positive means timezone is ahead of UTC (e.g. Asia/Jerusalem = +2h or +3h).
 */
function getTzOffsetMs(timezone: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone });
  const utc = new Date(utcStr);
  const tz = new Date(tzStr);
  return tz.getTime() - utc.getTime();
}

interface WeeklySchedule {
  [dayOfWeek: string]: TimeWindow[]; // "0"=Sun, "1"=Mon, ...
}

interface ExistingEvent {
  startTime: Date;
  endTime: Date;
}

interface BlockedRange {
  startDate: Date;
  endDate: Date;
  allDay: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface SlotsByDate {
  [dateStr: string]: TimeSlot[]; // "2026-02-22" => slots
}

/**
 * Generate available slots for a meeting type within a date range.
 */
export function getAvailableSlots(params: {
  weeklySchedule: WeeklySchedule;
  timezone: string;
  duration: number; // minutes
  bufferBefore: number;
  bufferAfter: number;
  dailyLimit: number | null;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  dateStart: Date;
  dateEnd: Date;
  blocks: BlockedRange[];
  existingMeetings: (ExistingEvent & { bufferBefore?: number; bufferAfter?: number })[];
  existingEvents: ExistingEvent[];
  meetingsPerDay: Record<string, number>; // "2026-02-22" => count
}): SlotsByDate {
  const {
    weeklySchedule,
    timezone,
    duration,
    bufferBefore,
    bufferAfter,
    dailyLimit,
    minAdvanceHours,
    maxAdvanceDays,
    dateStart,
    dateEnd,
    blocks,
    existingMeetings,
    existingEvents,
    meetingsPerDay,
  } = params;

  const now = new Date();
  const minAdvanceMs = minAdvanceHours * 60 * 60 * 1000;
  const earliestBookable = new Date(now.getTime() + minAdvanceMs);

  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays);

  // Clamp range
  const effectiveStart = dateStart > earliestBookable ? dateStart : earliestBookable;
  const effectiveEnd = dateEnd < maxDate ? dateEnd : maxDate;

  if (effectiveStart >= effectiveEnd) return {};

  // Build sorted list of busy intervals (meetings with buffers + events)
  const busyIntervals: { start: number; end: number }[] = [];

  for (const m of existingMeetings) {
    const mBefore = m.bufferBefore ?? 0;
    const mAfter = m.bufferAfter ?? 0;
    busyIntervals.push({
      start: m.startTime.getTime() - mBefore * 60_000,
      end: m.endTime.getTime() + mAfter * 60_000,
    });
  }

  for (const e of existingEvents) {
    busyIntervals.push({
      start: e.startTime.getTime(),
      end: e.endTime.getTime(),
    });
  }

  busyIntervals.sort((a, b) => a.start - b.start);

  // Build blocked intervals
  const blockedIntervals: { start: number; end: number }[] = blocks.map(b => ({
    start: b.startDate.getTime(),
    end: b.endDate.getTime(),
  }));

  const result: SlotsByDate = {};

  // Iterate day by day
  const currentDay = new Date(effectiveStart);
  currentDay.setUTCHours(0, 0, 0, 0);

  while (currentDay <= effectiveEnd) {
    // Calculate timezone-aware day-of-week
    const offsetMs = getTzOffsetMs(timezone, currentDay);
    const localDay = new Date(currentDay.getTime() + offsetMs);
    const dayOfWeek = localDay.getUTCDay().toString();
    const windows = weeklySchedule[dayOfWeek];

    if (!windows || windows.length === 0) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    const dateStr = formatDateStr(currentDay);

    // Check daily limit
    const dayCount = meetingsPerDay[dateStr] || 0;
    if (dailyLimit !== null && dayCount >= dailyLimit) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    // Check if entire day is blocked
    const dayStart = currentDay.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const isDayBlocked = blockedIntervals.some(b => b.start <= dayStart && b.end >= dayEnd);
    if (isDayBlocked) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    const daySlots: TimeSlot[] = [];
    let remainingCapacity = dailyLimit !== null ? dailyLimit - dayCount : Infinity;

    for (const window of windows) {
      if (remainingCapacity <= 0) break;

      const windowStart = parseTimeToDate(currentDay, window.start, offsetMs);
      const windowEnd = parseTimeToDate(currentDay, window.end, offsetMs);

      // Generate slots at duration intervals
      let slotStart = new Date(windowStart);

      while (slotStart.getTime() + duration * 60_000 <= windowEnd.getTime()) {
        if (remainingCapacity <= 0) break;

        const slotEnd = new Date(slotStart.getTime() + duration * 60_000);

        // The full occupied range including buffers
        const occupiedStart = slotStart.getTime() - bufferBefore * 60_000;
        const occupiedEnd = slotEnd.getTime() + bufferAfter * 60_000;

        // Check if slot is in the future (past earliestBookable)
        if (slotStart >= earliestBookable) {
          // Check no overlap with busy intervals
          const hasConflict = busyIntervals.some(
            b => b.start < occupiedEnd && b.end > occupiedStart,
          );

          // Check no overlap with blocked intervals
          const isBlocked = blockedIntervals.some(
            b => b.start < slotEnd.getTime() && b.end > slotStart.getTime(),
          );

          if (!hasConflict && !isBlocked) {
            daySlots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
            remainingCapacity--;
          }
        }

        // Move to next slot (by duration interval, not buffer)
        slotStart = new Date(slotStart.getTime() + duration * 60_000);
      }
    }

    if (daySlots.length > 0) {
      result[dateStr] = daySlots;
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return result;
}

/**
 * Parse a time string (e.g. "09:00") as a company-local time on the given day,
 * and return the corresponding UTC Date.
 * @param day - The UTC midnight of the current day being processed.
 * @param timeStr - Time in "HH:MM" format, in company-local time.
 * @param tzOffsetMs - Timezone offset in ms (positive = ahead of UTC).
 */
function parseTimeToDate(day: Date, timeStr: string, tzOffsetMs: number): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(day);
  d.setUTCHours(hours, minutes, 0, 0);
  // Convert from local time to UTC by subtracting the timezone offset
  return new Date(d.getTime() - tzOffsetMs);
}

function formatDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Check if a specific slot is available (for booking confirmation - race condition protection).
 */
export function isSlotAvailable(params: {
  slotStart: Date;
  slotEnd: Date;
  bufferBefore: number;
  bufferAfter: number;
  existingMeetings: ExistingEvent[];
  existingEvents: ExistingEvent[];
}): boolean {
  const occupiedStart = params.slotStart.getTime() - params.bufferBefore * 60_000;
  const occupiedEnd = params.slotEnd.getTime() + params.bufferAfter * 60_000;

  for (const m of params.existingMeetings) {
    if (m.startTime.getTime() < occupiedEnd && m.endTime.getTime() > occupiedStart) {
      return false;
    }
  }

  for (const e of params.existingEvents) {
    if (e.startTime.getTime() < occupiedEnd && e.endTime.getTime() > occupiedStart) {
      return false;
    }
  }

  return true;
}
