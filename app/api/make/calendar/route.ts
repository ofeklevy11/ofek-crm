import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const parseIsraelDate = (dateStr: string): Date => {
  // Check if string has timezone info (Z or +/-HH:mm)
  const hasTimezone = /Z|[+\-]\d{2}:?\d{2}$/.test(dateStr);

  if (hasTimezone) {
    return new Date(dateStr);
  }

  // Treat as Israel Time (Ambiguous input assumed to be local IL time)
  // 1. Parse as if it were UTC (default behavior for ISO string without TZ)
  //    e.g. "12:00" -> 12:00 UTC
  const d = new Date(dateStr);

  // 2. Find out what time 12:00 UTC is in Israel
  //    e.g. 12:00 UTC -> 14:00 Israel (in Winter)
  const israelTimeStr = d.toLocaleString("en-US", {
    timeZone: "Asia/Jerusalem",
  });
  const israelDateAsUtc = new Date(israelTimeStr);

  // 3. Calculate the difference (Israel is Ahead)
  //    14:00 - 12:00 = 2 hours (7200000 ms)
  const diff = israelDateAsUtc.getTime() - d.getTime();

  // 4. Subtract the difference to find the UTC time that RESULTS in the target Israel time
  //    We want result in Israel to be 12:00.
  //    Current result is 14:00 (which comes from 12:00 UTC).
  //    To get 12:00 Israel, we need to shift our UTC input BACK by the timezone offset.
  //    12:00 UTC - 2 hours = 10:00 UTC.
  //    10:00 UTC -> 12:00 Israel. Correct.
  return new Date(d.getTime() - diff);
};

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

    // 4. Date Parsing (with Israel Time assumption for ambiguous strings)
    const startDate = parseIsraelDate(start_time);
    const endDate = parseIsraelDate(end_time);

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
