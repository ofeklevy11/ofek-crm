import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateBookingInput } from "@/lib/meeting-validation";
import { isSlotAvailable } from "@/lib/meeting-slots";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { parseNotificationSettings } from "@/lib/notification-settings";
import { withMetrics } from "@/lib/with-metrics";
import { SECURE_TOKEN_RE } from "@/lib/crypto-tokens";
import { generateSecureToken } from "@/lib/crypto-tokens";
import { getClientIp } from "@/lib/request-ip";
import { validateJsonValue } from "@/lib/server-action-utils";
import { logSecurityEvent, SEC_MEETING_BOOKED } from "@/lib/security/audit-security";

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!SECURE_TOKEN_RE.test(token)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // CSRF protection: require JSON content-type
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    // Request body size limit (10KB)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 10000) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    // Rate limit by IP
    const ip = getClientIp(request);
    const rateLimited = await checkRateLimit(ip, RATE_LIMITS.publicBooking);
    if (rateLimited) return rateLimited;

    // Validate body
    const body = await request.json();
    const validation = validateBookingInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { participantName, participantEmail, participantPhone, startTime, customFieldData } =
      validation.data;

    // Look up meeting type (include customFields for validation)
    const meetingType = await prisma.meetingType.findFirst({
      where: { shareToken: token, isActive: true },
      select: {
        id: true,
        companyId: true,
        name: true,
        duration: true,
        color: true,
        bufferBefore: true,
        bufferAfter: true,
        customFields: true,
        dailyLimit: true,
        company: { select: { notificationSettings: true } },
      },
    });

    if (!meetingType) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Sanitize customFieldData before processing
    if (customFieldData !== undefined && customFieldData !== null) {
      try {
        validateJsonValue(customFieldData, 3, 51200, "customFieldData");
      } catch {
        return NextResponse.json({ error: "Invalid custom field data" }, { status: 400 });
      }
    }

    // Validate customFieldData against meeting type schema
    if (meetingType.customFields && Array.isArray(meetingType.customFields)) {
      const requiredFields = (meetingType.customFields as any[]).filter(
        (f) => f.required
      );
      if (requiredFields.length > 0) {
        const fieldData = customFieldData as Record<string, unknown> | undefined;
        for (const field of requiredFields) {
          const value = fieldData?.[field.name ?? field.label];
          if (value === undefined || value === null || value === "") {
            return NextResponse.json(
              { error: `Missing required field: ${field.label || field.name}` },
              { status: 400 },
            );
          }
        }
      }
    }

    // Calculate end time
    const endTime = new Date(startTime.getTime() + meetingType.duration * 60_000);

    // Verify slot availability (race condition protection)
    const [existingMeetings, existingEvents] = await Promise.all([
      prisma.meeting.findMany({
        where: {
          companyId: meetingType.companyId,
          status: { not: "CANCELLED" },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { startTime: true, endTime: true },
      }),
      prisma.calendarEvent.findMany({
        where: {
          companyId: meetingType.companyId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
          // Exclude calendar events linked to cancelled meetings
          NOT: { meeting: { status: "CANCELLED" } },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const slotOpen = isSlotAvailable({
      slotStart: startTime,
      slotEnd: endTime,
      bufferBefore: meetingType.bufferBefore,
      bufferAfter: meetingType.bufferAfter,
      existingMeetings,
      existingEvents,
    });

    if (!slotOpen) {
      return NextResponse.json(
        { error: "Slot is no longer available" },
        { status: 400 },
      );
    }

    // Transaction: re-verify slot + create meeting, find/create client, create calendar event
    const meeting = await prisma.$transaction(async (tx) => {
      // Generate crypto-secure manage token inside transaction
      const secureManageToken = generateSecureToken();
      // Re-verify slot availability INSIDE transaction to prevent double-booking
      const [txMeetings, txEvents] = await Promise.all([
        tx.meeting.findMany({
          where: {
            companyId: meetingType.companyId,
            status: { not: "CANCELLED" },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
          select: { startTime: true, endTime: true },
        }),
        tx.calendarEvent.findMany({
          where: {
            companyId: meetingType.companyId,
            startTime: { lt: endTime },
            endTime: { gt: startTime },
            OR: [
              { meeting: null },
              { meeting: { status: { not: "CANCELLED" } } },
            ],
          },
          select: { startTime: true, endTime: true },
        }),
      ]);

      if (!isSlotAvailable({
        slotStart: startTime,
        slotEnd: endTime,
        bufferBefore: meetingType.bufferBefore,
        bufferAfter: meetingType.bufferAfter,
        existingMeetings: txMeetings,
        existingEvents: txEvents,
      })) {
        throw new Error("SLOT_TAKEN");
      }

      // Re-verify daily limit inside transaction to prevent race condition
      if (meetingType.dailyLimit) {
        const dayStart = new Date(startTime);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(startTime);
        dayEnd.setHours(23, 59, 59, 999);

        const dayCount = await tx.meeting.count({
          where: {
            companyId: meetingType.companyId,
            status: { not: "CANCELLED" },
            startTime: { gte: dayStart, lte: dayEnd },
          },
        });

        if (dayCount >= meetingType.dailyLimit) {
          throw new Error("DAILY_LIMIT_REACHED");
        }
      }

      // 1. Create the calendar event
      const calendarEvent = await tx.calendarEvent.create({
        data: {
          companyId: meetingType.companyId,
          title: `${meetingType.name} - ${participantName}`,
          startTime,
          endTime,
          color: meetingType.color,
        },
      });

      // 2. Optionally find or create client by email/phone
      const notifSettings = parseNotificationSettings(meetingType.company?.notificationSettings);
      let clientId: number | undefined;

      if (notifSettings.autoCreateClientOnBooking) {
        let client: { id: number } | null = null;
        const clientWhereConditions: Array<Record<string, unknown>> = [];
        if (participantEmail) {
          clientWhereConditions.push({ email: participantEmail });
        }
        if (participantPhone) {
          clientWhereConditions.push({ phone: participantPhone });
        }

        if (clientWhereConditions.length > 0) {
          client = await tx.client.findFirst({
            where: {
              companyId: meetingType.companyId,
              OR: clientWhereConditions,
            },
            select: { id: true },
          });
        }

        if (!client) {
          client = await tx.client.create({
            data: {
              companyId: meetingType.companyId,
              name: participantName,
              email: participantEmail || null,
              phone: participantPhone || null,
            },
            select: { id: true },
          });
        }

        clientId = client.id;
      }

      // 3. Create the meeting linked to client (if created) and calendar event
      const newMeeting = await tx.meeting.create({
        data: {
          companyId: meetingType.companyId,
          meetingTypeId: meetingType.id,
          participantName,
          participantEmail: participantEmail || null,
          participantPhone: participantPhone || null,
          customFieldData: customFieldData ?? undefined,
          startTime,
          endTime,
          clientId: clientId ?? null,
          calendarEventId: calendarEvent.id,
          manageToken: secureManageToken,
        },
        select: { id: true, manageToken: true },
      });

      return newMeeting;
    }, { timeout: 10_000 });

    // Security audit log (fire-and-forget)
    logSecurityEvent({
      action: SEC_MEETING_BOOKED,
      companyId: meetingType.companyId,
      ip,
      details: { meetingId: meeting.id, meetingTypeId: meetingType.id, participantName },
    });

    // Send notifications to company admins (fire-and-forget, outside transaction)
    const bookingSettings = parseNotificationSettings(meetingType.company?.notificationSettings);
    if (bookingSettings.notifyOnMeetingBooked) {
      const dateStr = startTime.toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeStr = startTime.toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      prisma.user
        .findMany({
          where: { companyId: meetingType.companyId, role: "admin" },
          select: { id: true },
          take: 25,
        })
        .then((admins) => {
          for (const admin of admins) {
            createNotificationForCompany({
              companyId: meetingType.companyId,
              userId: admin.id,
              title: `פגישה חדשה: ${participantName} - ${meetingType.name} ב-${dateStr} ${timeStr}`,
              link: "/meetings",
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    // Fire meeting automations (fire-and-forget)
    import("@/app/actions/meeting-automations")
      .then(({ fireMeetingAutomations }) =>
        fireMeetingAutomations(meetingType.companyId, "MEETING_BOOKED", {
          id: meeting.id,
          meetingTypeId: meetingType.id,
          participantName,
          participantEmail,
          participantPhone,
          startTime,
          endTime,
          meetingTypeName: meetingType.name,
        }),
      )
      .catch(() => {});

    return NextResponse.json({
      success: true,
      manageToken: meeting.manageToken,
    });
  } catch (error: any) {
    if (error?.message === "SLOT_TAKEN") {
      return NextResponse.json(
        { error: "Slot is no longer available" },
        { status: 400 },
      );
    }
    if (error?.message === "DAILY_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "Daily limit reached for this day" },
        { status: 400 },
      );
    }
    console.error("[PublicBooking] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics("/api/p/meetings/[token]/book", handlePOST);
