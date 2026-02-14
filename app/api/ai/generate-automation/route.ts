import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/permissions-server";

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

    const { prompt, existingAutomations } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Rate limiting per user (atomic INCR + EXPIRE via pipeline)
    const rateLimitKey = `ai-rate:${user.id}`;
    const results = await redis.multi().incr(rateLimitKey).expire(rateLimitKey, RATE_LIMIT_WINDOW).exec();
    if (!results || (results[0]?.[1] as number) > RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "Rate limit exceeded. Please wait a minute." }, { status: 429 });
    }

    // SECURITY: Fetch tables and users from DB scoped by companyId (Issue F)
    const { prisma } = await import("@/lib/prisma");
    const [dbTables, dbUsers, dbAutomations] = await Promise.all([
      prisma.tableMeta.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, schemaJson: true },
        take: 200,
      }),
      prisma.user.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, email: true, role: true },
        take: 200,
      }),
      prisma.automationRule.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, triggerType: true, actionType: true },
        take: 200,
      }),
    ]);

    // Payload size guard
    const eventData = {
      jobId: "",
      type: "automation",
      prompt,
      context: { tables: dbTables, users: dbUsers, existingAutomations: dbAutomations },
      companyId: user.companyId,
    };
    const payloadSize = new TextEncoder().encode(JSON.stringify(eventData)).length;
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Payload too large. Try simplifying the request." }, { status: 413 });
    }

    const jobId = randomUUID();
    eventData.jobId = jobId;

    await redis.set(`ai-job:${jobId}`, JSON.stringify({ status: "pending", companyId: user.companyId }), "EX", 600);

    await inngest.send({
      id: `ai-gen-${jobId}`,
      name: "ai/generation.requested",
      data: eventData,
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error: any) {
    console.error("Error dispatching automation generation:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
