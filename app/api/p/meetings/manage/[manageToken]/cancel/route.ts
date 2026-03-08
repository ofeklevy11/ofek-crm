import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
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
            take: 10,
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
