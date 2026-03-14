import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSlotAvailable } from "@/lib/meeting-slots";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { isNotificationEnabled } from "@/lib/notification-settings";
import { withMetrics } from "@/lib/with-metrics";
import { SECURE_TOKEN_RE } from "@/lib/crypto-tokens";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent, SEC_MEETING_RESCHEDULED } from "@/lib/security/audit-security";

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ manageToken: string }> },
) {
  try {
    const { manageToken } = await params;

    if (!SECURE_TOKEN_RE.test(manageToken)) {
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
            minAdvanceHours: true,
            maxAdvanceDays: true,
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

    // Reject past dates
    if (newStart.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Cannot reschedule to a past date" },
        { status: 400 },
      );
    }

    // Enforce minimum advance hours
    const minAdvanceMs = (meeting.meetingType.minAdvanceHours ?? 0) * 3600_000;
    if (minAdvanceMs > 0 && newStart.getTime() < Date.now() + minAdvanceMs) {
      return NextResponse.json(
        { error: "Too soon — minimum advance time not met" },
        { status: 400 },
      );
    }

    // Enforce maximum advance days
    const maxAdvanceDays = meeting.meetingType.maxAdvanceDays ?? 0;
    if (maxAdvanceDays > 0) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
      if (newStart.getTime() > maxDate.getTime()) {
        return NextResponse.json(
          { error: "Date too far in advance" },
          { status: 400 },
        );
      }
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
    }, { timeout: 10_000 });

    // Security audit log (fire-and-forget)
    logSecurityEvent({
      action: SEC_MEETING_RESCHEDULED,
      companyId: meeting.companyId,
      ip,
      details: { meetingId: meeting.id, participantName: meeting.participantName, newStart: newStart.toISOString() },
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
            take: 25,
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
