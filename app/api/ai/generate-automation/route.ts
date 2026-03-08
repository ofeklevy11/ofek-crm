import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";
import { buildAutomationContext, serializeRawContext } from "@/lib/ai/automation-context";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AiAutomation");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 600 * 1024; // 600KB
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60; // seconds

async function handlePOST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasUserFlag(user, "canViewAutomations")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { prompt, mode: rawMode, currentSchema } = body;
    const mode: "create" | "suggest" = rawMode === "suggest" ? "suggest" : "create";

    // Validate optional currentSchema for modify mode
    if (currentSchema != null) {
      if (typeof currentSchema !== "object" || !currentSchema.triggerType || !currentSchema.actionType) {
        return NextResponse.json({ error: "Invalid currentSchema" }, { status: 400 });
      }
    }

    // In create mode, prompt is required. In suggest mode, it's optional.
    if (mode === "create") {
      if (!prompt || typeof prompt !== "string" || prompt.length > 10000) {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
      }
    } else if (prompt && (typeof prompt !== "string" || prompt.length > 10000)) {
      return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
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

    // Early Redis health check — fail fast before expensive DB queries
    try {
      await redis.ping();
    } catch (err) {
      log.warn("Redis unavailable before automation generation", { error: String(err) });
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    // Build full context from DB
    const automationContext = await buildAutomationContext(user.companyId);

    // Payload size guard
    const eventData: Record<string, any> = {
      jobId: "",
      type: "automation",
      prompt: prompt || "",
      context: {
        formatted: automationContext.formatted,
        rawContext: serializeRawContext(automationContext._raw),
        ...(currentSchema ? { currentSchema } : {}),
      },
      companyId: user.companyId,
      mode,
    };
    const payloadSize = new TextEncoder().encode(JSON.stringify(eventData)).length;
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large. Try simplifying the request." }, { status: 413 });
    }

    const jobId = randomUUID();
    eventData.jobId = jobId;

    try {
      await redis.set(`ai-job:${jobId}`, JSON.stringify({ status: "pending", companyId: user.companyId }), "EX", 600);
    } catch (err) {
      log.warn("Redis unavailable when setting pending job", { jobId, error: String(err) });
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    await inngest.send({
      id: `ai-gen-${jobId}`,
      name: "ai/generation.requested",
      data: eventData as any,
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error: any) {
    log.error("Failed to dispatch automation generation", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = withMetrics("/api/ai/generate-automation", handlePOST);
