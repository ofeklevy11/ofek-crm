import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOKEN_RE = /^[a-zA-Z0-9]{10,50}$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ manageToken: string }> },
) {
  const { manageToken } = await params;

  if (!TOKEN_RE.test(manageToken)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

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
        select: { name: true, duration: true, color: true, shareToken: true },
      },
      company: { select: { name: true, logoUrl: true } },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(meeting);
}
