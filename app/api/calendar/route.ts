import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const events = await prisma.calendarEvent.findMany({
      where: { companyId: user.companyId },
    });
    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, startTime, endTime, color } = body;

    const event = await prisma.calendarEvent.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId for multi-tenancy
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        color,
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
