import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeCalendar");
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";
import { createCalendarEventForCompany } from "@/lib/calendar-helpers";
import { prisma } from "@/lib/prisma";
import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENTS_PER_COMPANY,
} from "@/lib/calendar-validation";
import { defaultEventColors } from "@/lib/types";

const ALLOWED_COLORS = new Set([
  ...defaultEventColors,
  "blue", "red", "green", "yellow", "purple", "orange", "cyan", "pink",
]);

const parseIsraelDate = (dateStr: string): Date => {
  // Check if string has timezone info (Z or +/-HH:mm)
  const hasTimezone = /Z|[+\-]\d{2}:?\d{2}$/.test(dateStr);

  if (hasTimezone) {
    return new Date(dateStr);
  }

  // Treat as Israel Time (Ambiguous input assumed to be local IL time)
  const d = new Date(dateStr);
  const israelTimeStr = d.toLocaleString("en-US", {
    timeZone: "Asia/Jerusalem",
  });
  const israelDateAsUtc = new Date(israelTimeStr);
  const diff = israelDateAsUtc.getTime() - d.getTime();
  return new Date(d.getTime() - diff);
};

export async function POST(req: Request) {
  try {
    // 1. Validate per-company API key (prevents cross-company writes)
    const apiKey = req.headers.get("x-company-api-key");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing x-company-api-key header" },
        { status: 401 }
      );
    }

    const keyRecord = await findApiKeyByValue(apiKey);

    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or inactive Company API Key" },
        { status: 401 }
      );
    }

    // Rate limit per company
    const rateLimited = await checkRateLimit(String(keyRecord.companyId), RATE_LIMITS.webhook);
    if (rateLimited) return rateLimited;

    // Idempotency: if X-Idempotency-Key header is present, deduplicate
    const { key: idempotencyKey, cachedResponse } = await checkIdempotencyKey(req, "calendar");
    if (cachedResponse) return cachedResponse;

    const companyId = keyRecord.companyId;

    const body = await req.json();
    const { title, description, start_time, end_time, color } = body;

    // 3. Validate Required Fields + Lengths
    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    if (title.trim().length === 0 || title.trim().length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Title must be 1-${MAX_TITLE_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
        return NextResponse.json(
          { error: `Description must be a string under ${MAX_DESCRIPTION_LENGTH} characters` },
          { status: 400 }
        );
      }
    }

    if (!start_time || !end_time) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: start_time and end_time are required",
        },
        { status: 400 }
      );
    }

    if (typeof start_time !== "string" || typeof end_time !== "string") {
      return NextResponse.json(
        { error: "start_time and end_time must be strings" },
        { status: 400 }
      );
    }

    // Validate color
    let sanitizedColor = "blue";
    if (color !== undefined && color !== null) {
      if (typeof color !== "string") {
        return NextResponse.json({ error: "Color must be a string" }, { status: 400 });
      }
      const isValidHex = /^#[0-9a-f]{6}$/i.test(color.trim());
      if (!isValidHex && !ALLOWED_COLORS.has(color.trim().toLowerCase()) && !ALLOWED_COLORS.has(color.trim())) {
        return NextResponse.json({ error: "Invalid color value" }, { status: 400 });
      }
      sanitizedColor = color.trim();
    }

    // 4. Date Parsing (with Israel Time assumption for ambiguous strings)
    const startDate = parseIsraelDate(start_time);
    const endDate = parseIsraelDate(end_time);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        {
          error:
            "Invalid date format. Use ISO-8601 (e.g. 2024-01-25T14:00:00Z)",
        },
        { status: 400 }
      );
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: "end_time must be after start_time" },
        { status: 400 }
      );
    }

    // 5. Enforce per-company event limit (soft limit — TOCTOU race is bounded by webhook rate limit to ~60 overshoot)
    const eventCount = await prisma.calendarEvent.count({
      where: { companyId },
    });
    if (eventCount >= MAX_EVENTS_PER_COMPANY) {
      return NextResponse.json(
        { error: `Event limit reached (${MAX_EVENTS_PER_COMPANY}). Delete old events first.` },
        { status: 429 }
      );
    }

    // 6. Create Calendar Event scoped to the API key's company (with global automation rules)
    const event = await createCalendarEventForCompany(
      companyId,
      keyRecord.createdBy,
      {
        title: title.trim(),
        description: description?.trim() || null,
        startTime: startDate,
        endTime: endDate,
        color: sanitizedColor,
      },
    );

    const responseBody = { success: true, event };
    if (idempotencyKey) await setIdempotencyResult("calendar", idempotencyKey, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    log.error("Failed to create calendar event via webhook", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
