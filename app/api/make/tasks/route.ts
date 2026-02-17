import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeTasks");
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";
import { makeCreateTaskSchema } from "@/lib/validations/tasks";

export async function POST(req: Request) {
  try {
    // 1. Validate per-company API key (prevents cross-company writes)
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

    // Idempotency: if X-Idempotency-Key header is present, deduplicate
    const { key: idempotencyKey, cachedResponse } = await checkIdempotencyKey(req, "tasks");
    if (cachedResponse) return cachedResponse;

    const companyId = keyRecord.companyId;

    // Validate input
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = makeCreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Optionally resolve assignee by email (must belong to same company)
    let assigneeId: number | undefined;
    if (data.email) {
      const user = await prisma.user.findFirst({
        where: { email: data.email, companyId },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Invalid request" },
          { status: 400 }
        );
      }
      assigneeId = user.id;
    }

    // Create the task scoped to the API key's company
    const task = await prisma.task.create({
      data: {
        companyId,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assigneeId,
        dueDate: data.due_date,
      },
    });

    const responseBody = { success: true, task };
    if (idempotencyKey) await setIdempotencyResult("tasks", idempotencyKey, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    log.error("Failed to create task via webhook", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
