import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // 1. Validate global webhook secret
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    const authHeader = req.headers.get("x-api-secret");

    if (!secret || authHeader !== secret) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing secret key" },
        { status: 401 }
      );
    }

    // 2. Validate per-company API key (prevents cross-company writes)
    const apiKey = req.headers.get("x-company-api-key");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing x-company-api-key header" },
        { status: 401 }
      );
    }

    const keyRecord = await findApiKeyByValue(apiKey);

    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or inactive Company API Key" },
        { status: 401 }
      );
    }

    // Rate limit per company
    const rateLimited = await checkRateLimit(String(keyRecord.companyId), RATE_LIMITS.webhook);
    if (rateLimited) return rateLimited;

    const companyId = keyRecord.companyId;

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

    // Optionally resolve assignee by email (must belong to same company)
    let assigneeId: number | undefined;
    if (email) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, companyId: true },
      });
      if (!user || user.companyId !== companyId) {
        return NextResponse.json(
          { error: "Invalid request: user not found in this company" },
          { status: 400 }
        );
      }
      assigneeId = user.id;
    }

    // Create the task scoped to the API key's company
    const task = await prisma.task.create({
      data: {
        companyId,
        title,
        description,
        status,
        priority,
        assigneeId,
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
