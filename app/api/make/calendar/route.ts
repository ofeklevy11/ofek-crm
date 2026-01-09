import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Authentication Check
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    const authHeader = req.headers.get("x-api-secret");

    if (!secret || authHeader !== secret) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing secret key" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { title, description, email, start_time, end_time, color } = body;

    // 2. Validate Required Fields
    if (!title) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error:
            "Missing required field: email (required to identify user and company)",
        },
        { status: 400 }
      );
    }

    if (!start_time || !end_time) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: start_time and end_time are required",
        },
        { status: 400 }
      );
    }

    // 3. User & Company Context
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: `User with email "${email}" not found` },
        { status: 404 }
      );
    }

    // 4. Date Parsing
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        {
          error:
            "Invalid date format. Use ISO-8601 (e.g. 2024-01-25T14:00:00Z)",
        },
        { status: 400 }
      );
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: "end_time must be after start_time" },
        { status: 400 }
      );
    }

    // 5. Create Calendar Event
    const event = await prisma.calendarEvent.create({
      data: {
        companyId: user.companyId,
        title,
        description: description || null,
        startTime: startDate,
        endTime: endDate,
        color: color || "blue", // Default color if not provided
      },
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
