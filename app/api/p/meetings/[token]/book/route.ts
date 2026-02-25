import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateBookingInput } from "@/lib/meeting-validation";
import { isSlotAvailable } from "@/lib/meeting-slots";
import { createNotificationForCompany } from "@/lib/notifications-internal";

const TOKEN_RE = /^[a-zA-Z0-9]{10,50}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
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

    // Look up meeting type
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
      },
    });

    if (!meetingType) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

      // 2. Find or create client by email/phone
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

      // 3. Create the meeting linked to client and calendar event
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
          clientId: client.id,
          calendarEventId: calendarEvent.id,
        },
        select: { id: true, manageToken: true },
      });

      return newMeeting;
    });

    // Send notifications to company admins (fire-and-forget, outside transaction)
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
        take: 10,
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
    console.error("[PublicBooking] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
