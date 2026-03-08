import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withMetrics } from "@/lib/with-metrics";

const TOKEN_RE = /^[a-zA-Z0-9]{10,50}$/;

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const meetingType = await prisma.meetingType.findFirst({
    where: { shareToken: token, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      duration: true,
      color: true,
      customFields: true,
      minAdvanceHours: true,
      maxAdvanceDays: true,
      availabilityOverride: true,
      companyId: true,
      company: {
        select: {
          name: true,
          logoUrl: true,
          companyAvailability: { select: { weeklySchedule: true } },
        },
      },
    },
  });

  if (!meetingType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Determine which days of the week have availability windows
  let schedule: Record<string, { start: string; end: string }[]>;

  if (meetingType.availabilityOverride) {
    schedule = meetingType.availabilityOverride as Record<string, { start: string; end: string }[]>;
  } else {
    const weeklySchedule = meetingType.company.companyAvailability?.weeklySchedule;
    schedule = (weeklySchedule ?? {
      "0": [{ start: "09:00", end: "17:00" }],
      "1": [{ start: "09:00", end: "17:00" }],
      "2": [{ start: "09:00", end: "17:00" }],
      "3": [{ start: "09:00", end: "17:00" }],
      "4": [{ start: "09:00", end: "17:00" }],
      "5": [],
      "6": [],
    }) as Record<string, { start: string; end: string }[]>;
  }

  const availableDays = Object.entries(schedule)
    .filter(([, windows]) => windows && windows.length > 0)
    .map(([day]) => Number(day));

  // Omit internal fields from response
  const { availabilityOverride: _, companyId: __, ...rest } = meetingType;

  return NextResponse.json({ ...rest, availableDays });
}

export const GET = withMetrics("/api/p/meetings/[token]", handleGET);
