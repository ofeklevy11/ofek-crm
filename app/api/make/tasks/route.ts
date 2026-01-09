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
    const {
      title,
      description,
      email,
      status = "OPEN",
      priority = "MEDIUM",
      due_date,
    } = body;

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

    // Find user to get company context
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: `User with email "${email}" not found` },
        { status: 404 }
      );
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        companyId: user.companyId,
        title,
        description,
        status,
        priority,
        assigneeId: user.id, // Assign to the user found by email
        dueDate:
          due_date && due_date !== "YYYY-MM-DD" && !isNaN(Date.parse(due_date))
            ? new Date(due_date)
            : undefined,
      },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
