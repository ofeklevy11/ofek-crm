import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSlotAvailable } from "@/lib/meeting-slots";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { isNotificationEnabled } from "@/lib/notification-settings";
import { withMetrics } from "@/lib/with-metrics";

const TOKEN_RE = /^[a-zA-Z0-9]{10,50}$/;

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ manageToken: string }> },
) {
  try {
    const { manageToken } = await params;

    if (!TOKEN_RE.test(manageToken)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateLimited = await checkRateLimit(ip, RATE_LIMITS.publicBooking);
    if (rateLimited) return rateLimited;

    const meeting = await prisma.meeting.findUnique({
      where: { manageToken },
      select: {
        id: true,
        companyId: true,
        status: true,
        participantName: true,
        calendarEventId: true,
        meetingType: {
          select: {
            name: true,
            duration: true,
            bufferBefore: true,
            bufferAfter: true,
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (meeting.status === "CANCELLED" || meeting.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Meeting cannot be rescheduled" },
        { status: 400 },
      );
    }

    // Parse and validate new start time
    const body = await request.json();
    if (!body.startTime || typeof body.startTime !== "string") {
      return NextResponse.json(
        { error: "startTime is required" },
        { status: 400 },
      );
    }

    const newStart = new Date(body.startTime);
    if (isNaN(newStart.getTime())) {
      return NextResponse.json(
        { error: "Invalid startTime" },
        { status: 400 },
      );
    }

    const newEnd = new Date(
      newStart.getTime() + meeting.meetingType.duration * 60_000,
    );

    // Verify slot + update atomically inside interactive transaction to prevent TOCTOU double-booking
    await prisma.$transaction(async (tx) => {
      const [txMeetings, txEvents] = await Promise.all([
        tx.meeting.findMany({
          where: {
            companyId: meeting.companyId,
            id: { not: meeting.id },
            status: { not: "CANCELLED" },
            startTime: { lt: newEnd },
            endTime: { gt: newStart },
          },
          select: { startTime: true, endTime: true },
        }),
        tx.calendarEvent.findMany({
          where: {
            companyId: meeting.companyId,
            id: meeting.calendarEventId
              ? { not: meeting.calendarEventId }
              : undefined,
            startTime: { lt: newEnd },
            endTime: { gt: newStart },
          },
          select: { startTime: true, endTime: true },
        }),
      ]);

      if (
        !isSlotAvailable({
          slotStart: newStart,
          slotEnd: newEnd,
          bufferBefore: meeting.meetingType.bufferBefore,
          bufferAfter: meeting.meetingType.bufferAfter,
          existingMeetings: txMeetings,
          existingEvents: txEvents,
        })
      ) {
        throw new Error("SLOT_TAKEN");
      }

      await tx.meeting.update({
        where: { id: meeting.id },
        data: { startTime: newStart, endTime: newEnd },
      });
      if (meeting.calendarEventId) {
        await tx.calendarEvent.update({
          where: { id: meeting.calendarEventId },
          data: { startTime: newStart, endTime: newEnd },
        });
      }
    });

    // Notify admins (fire-and-forget) — guarded by toggle
    isNotificationEnabled(meeting.companyId, "notifyOnMeetingRescheduled")
      .then((enabled) => {
        if (!enabled) return;
        const dateStr = newStart.toLocaleDateString("he-IL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const timeStr = newStart.toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        prisma.user
          .findMany({
            where: { companyId: meeting.companyId, role: "admin" },
            select: { id: true },
            take: 10,
          })
          .then((admins) => {
            for (const admin of admins) {
              createNotificationForCompany({
                companyId: meeting.companyId,
                userId: admin.id,
                title: `פגישה נדחתה: ${meeting.participantName} - ${meeting.meetingType.name} ל-${dateStr} ${timeStr}`,
                link: "/meetings",
              }).catch(() => {});
            }
          })
          .catch(() => {});
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === "SLOT_TAKEN") {
      return NextResponse.json(
        { error: "Slot is no longer available" },
        { status: 400 },
      );
    }
    console.error("[PublicMeetingReschedule] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics("/api/p/meetings/manage/[manageToken]/reschedule", handlePOST);
