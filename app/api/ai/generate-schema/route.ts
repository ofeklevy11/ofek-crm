import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";

const log = createLogger("AiSchema");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 400 * 1024; // 400KB
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60; // seconds

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageTables(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { prompt, currentSchema } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.length > 10000) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Rate limiting per user (atomic INCR + EXPIRE via pipeline, with in-memory fallback)
    try {
      const rateLimitKey = `ai-rate:${user.id}`;
      const results = await redis.multi().incr(rateLimitKey).expire(rateLimitKey, RATE_LIMIT_WINDOW).exec();
      if (!results || (results[0]?.[1] as number) > RATE_LIMIT_MAX) {
        return NextResponse.json({ error: "Rate limit exceeded. Please wait a minute." }, { status: 429 });
      }
    } catch {
      // Redis down — fall back to in-memory rate limiting
      if (checkMemoryRateLimit(`ai-rate:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)) {
        return NextResponse.json({ error: "Rate limit exceeded. Please wait a minute." }, { status: 429 });
      }
    }

    // SECURITY: Fetch existing tables from DB scoped by companyId (Issue G)
    const { prisma } = await import("@/lib/prisma");
    const dbTables = await prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, schemaJson: true },
      take: 200,
    });

    // Payload size guard
    const eventData = {
      jobId: "",
      type: "schema",
      prompt,
      context: { existingTables: dbTables, currentSchema },
      companyId: user.companyId,
    };
    const payloadSize = new TextEncoder().encode(JSON.stringify(eventData)).length;
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large. Try simplifying the request." }, { status: 413 });
    }

    const jobId = randomUUID();
    eventData.jobId = jobId;

    // Mark as pending in Redis immediately (include companyId for isolation)
    await redis.set(`ai-job:${jobId}`, JSON.stringify({ status: "pending", companyId: user.companyId }), "EX", 600);

    // Dispatch to Inngest background job
    await inngest.send({
      id: `ai-gen-${jobId}`,
      name: "ai/generation.requested",
      data: eventData,
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error: any) {
    log.error("Failed to dispatch schema generation", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
