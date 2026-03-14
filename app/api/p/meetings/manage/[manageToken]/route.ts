import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withMetrics } from "@/lib/with-metrics";
import { SECURE_TOKEN_RE } from "@/lib/crypto-tokens";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ manageToken: string }> },
) {
  const { manageToken } = await params;

  if (!SECURE_TOKEN_RE.test(manageToken)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rate limit by IP to prevent brute-force enumeration
  const ip = getClientIp(request);
  const rateLimited = await checkRateLimit(ip, RATE_LIMITS.publicManageRead);
  if (rateLimited) return rateLimited;

  const meeting = await prisma.meeting.findUnique({
    where: { manageToken },
    select: {
      participantName: true,
      participantEmail: true,
      participantPhone: true,
      startTime: true,
      endTime: true,
      status: true,
      notesBefore: true,
      cancelReason: true,
      cancelledAt: true,
      meetingType: {
        select: { name: true, duration: true, color: true },
      },
      company: { select: { name: true, logoUrl: true } },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.json(meeting);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export const GET = withMetrics("/api/p/meetings/manage/[manageToken]", handleGET);
