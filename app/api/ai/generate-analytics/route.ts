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

    const { prompt, tables } = await req.json();

    if (!prompt || !Array.isArray(tables)) {
      return NextResponse.json({ error: "Prompt and tables are required" }, { status: 400 });
    }

    // Rate limiting per user (atomic INCR + EXPIRE via pipeline)
    const rateLimitKey = `ai-rate:${user.id}`;
    const results = await redis.multi().incr(rateLimitKey).expire(rateLimitKey, RATE_LIMIT_WINDOW).exec();
    if (!results || (results[0]?.[1] as number) > RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "Rate limit exceeded. Please wait a minute." }, { status: 429 });
    }

    // SECURITY: DB-validate table IDs instead of trusting client-supplied companyId
    const { prisma } = await import("@/lib/prisma");
    const userTables = await prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, schemaJson: true },
      take: 200,
    });
    const validTableIds = new Set(userTables.map((t: any) => t.id));
    const formattedTables = tables
      .filter((t: any) => validTableIds.has(t.id))
      .map((t: any) => {
        const dbTable = userTables.find((ut: any) => ut.id === t.id);
        let columns: any[] = [];
        const schemaSource = dbTable?.schemaJson || t.schemaJson;
        if (schemaSource) {
          let schema = schemaSource;
          if (typeof schema === "string") {
            try { schema = JSON.parse(schema); } catch (e) {}
          }
          if (Array.isArray(schema)) columns = schema;
          else if (schema.columns && Array.isArray(schema.columns)) columns = schema.columns;
        }
        return { id: t.id, name: dbTable?.name || t.name, columns };
      });

    // Payload size guard
    const eventData = {
      jobId: "",
      type: "analytics",
      prompt,
      context: { formattedTables },
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
    console.error("Error dispatching analytics generation:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
