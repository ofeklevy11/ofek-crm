import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { isNotificationEnabled } from "@/lib/notification-settings";
import { withMetrics } from "@/lib/with-metrics";
import { SECURE_TOKEN_RE } from "@/lib/crypto-tokens";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent, SEC_MEETING_CANCELLED } from "@/lib/security/audit-security";

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
        participantEmail: true,
        participantPhone: true,
        startTime: true,
        endTime: true,
        meetingTypeId: true,
        meetingType: { select: { name: true } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (meeting.status === "CANCELLED" || meeting.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Meeting cannot be cancelled" },
        { status: 400 },
      );
    }

    // Parse optional reason
    let cancelReason: string | undefined;
    try {
      const body = await request.json();
      if (body.reason && typeof body.reason === "string") {
        cancelReason = body.reason.slice(0, 1000);
      }
    } catch {
      // No body or invalid JSON is fine
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "participant",
        cancelReason,
      },
    });

    // Security audit log (fire-and-forget)
    logSecurityEvent({
      action: SEC_MEETING_CANCELLED,
      companyId: meeting.companyId,
      ip,
      details: { meetingId: meeting.id, participantName: meeting.participantName },
    });

    // Notify admins (fire-and-forget) — guarded by toggle
    isNotificationEnabled(meeting.companyId, "notifyOnMeetingCancelled")
      .then((enabled) => {
        if (!enabled) return;
        const dateStr = meeting.startTime.toLocaleDateString("he-IL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const timeStr = meeting.startTime.toLocaleTimeString("he-IL", {
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
                title: `פגישה בוטלה: ${meeting.participantName} - ${meeting.meetingType.name} ב-${dateStr} ${timeStr}`,
                link: "/meetings",
              }).catch(() => {});
            }
          })
          .catch(() => {});
      })
      .catch(() => {});

    // Fire MEETING_CANCELLED automations (fire-and-forget)
    import("@/app/actions/meeting-automations")
      .then(({ fireMeetingAutomations }) =>
        fireMeetingAutomations(meeting.companyId, "MEETING_CANCELLED", {
          id: meeting.id,
          meetingTypeId: meeting.meetingTypeId,
          participantName: meeting.participantName,
          participantEmail: meeting.participantEmail,
          participantPhone: meeting.participantPhone,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          meetingTypeName: meeting.meetingType.name,
        }),
      )
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PublicMeetingCancel] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics("/api/p/meetings/manage/[manageToken]/cancel", handlePOST);
