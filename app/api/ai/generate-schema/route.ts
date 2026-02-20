import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";

const log = createLogger("AiSchema");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 600 * 1024; // 600KB
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60; // seconds

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Bypass stale Redis cache — fetch fresh role/permissions from DB
    const { prisma } = await import("@/lib/prisma");
    await invalidateUserCache(user.id);
    const freshRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, permissions: true },
    });
    const checkedUser = freshRow
      ? { ...user, role: freshRow.role as UserRole, permissions: freshRow.permissions as Record<string, boolean> | undefined }
      : user;

    log.info("AI generate-schema auth check", { userId: checkedUser.id, role: checkedUser.role, hasCanManageTables: !!(checkedUser as any).permissions?.canManageTables });
    if (!canManageTables(checkedUser)) {
      return NextResponse.json({
        error: `Forbidden – role=${checkedUser.role}, canManageTables=${!!(checkedUser.permissions as any)?.canManageTables}`,
      }, { status: 403 });
    }

    const { prompt, currentSchema } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.length > 10_000) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // NOTE: existingTables from client payload is intentionally ignored — fetched securely from DB below

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

    // SECURITY: Fetch existing tables + categories from DB scoped by companyId
    const [dbTables, dbCategories] = await Promise.all([
      prisma.tableMeta.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, schemaJson: true },
        take: 200,
      }),
      prisma.tableCategory.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true },
        take: 50,
      }),
    ]);

    // Build structured table context with field details (cap at 30 fields per table)
    const structuredTables = dbTables.map((t) => {
      let fields: { name: string; type: string; label: string }[] = [];
      try {
        const schema = typeof t.schemaJson === "string"
          ? JSON.parse(t.schemaJson)
          : t.schemaJson;
        if (Array.isArray(schema)) {
          fields = schema.slice(0, 30).map((f: any) => ({
            name: f.name || "",
            type: f.type || "text",
            label: f.label || f.name || "",
          }));
        }
      } catch { /* ignore malformed schema */ }
      return { id: t.id, name: t.name, fields };
    });

    // Payload size guard
    const eventData = {
      jobId: "",
      type: "schema",
      prompt,
      context: {
        existingTables: structuredTables,
        categories: dbCategories,
        currentSchema,
      },
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
