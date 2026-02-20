import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics } from "@/lib/permissions";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";

const log = createLogger("AiAnalytics");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 400 * 1024; // 400KB
const MAX_BODY_BYTES = 512 * 1024; // 512KB raw body guard
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60; // seconds

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageAnalytics(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Body size guard: read as text first, check size, then parse
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { prompt, tables, mode = "single", currentReport, currentView } = parsed;

    if (!Array.isArray(tables) || tables.length > 100) {
      return NextResponse.json({ error: "Tables are required" }, { status: 400 });
    }

    const validModes = new Set(["single", "report", "refine", "single-refine", "suggestions"]);
    if (!validModes.has(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    // Prompt is optional for suggestions mode (used as optional hint)
    if (mode === "suggestions") {
      if (prompt && (typeof prompt !== "string" || prompt.length > 10000)) {
        return NextResponse.json({ error: "Prompt is too long" }, { status: 400 });
      }
    } else {
      if (!prompt || typeof prompt !== "string" || prompt.length > 10000) {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
      }
    }

    if (mode === "refine" && (!currentReport || typeof currentReport !== "object")) {
      return NextResponse.json({ error: "currentReport is required for refine mode" }, { status: 400 });
    }

    if (mode === "single-refine" && (!currentView || typeof currentView !== "object")) {
      return NextResponse.json({ error: "currentView is required for single-refine mode" }, { status: 400 });
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

    // SECURITY: DB-validate table IDs instead of trusting client-supplied companyId
    const { prisma } = await import("@/lib/prisma");
    const companyId = user.companyId;

    // Parallel DB queries: tables + enrichment context
    const [
      userTables,
      companyInfo,
      existingViews,
      taskCount,
      retainerCount,
      paymentCount,
      transactionCount,
      eventCount,
      clientCount,
      teamMembers,
      recordCounts,
    ] = await Promise.all([
      prisma.tableMeta.findMany({
        where: { companyId },
        select: { id: true, name: true, schemaJson: true },
        take: 200,
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, businessType: true },
      }),
      prisma.analyticsView.findMany({
        where: { companyId },
        select: { title: true, type: true },
        take: 100,
      }),
      prisma.task.count({ where: { companyId } }),
      prisma.retainer.count({ where: { companyId } }),
      prisma.oneTimePayment.count({ where: { companyId } }),
      prisma.transaction.count({ where: { companyId } }),
      prisma.calendarEvent.count({ where: { companyId } }),
      prisma.client.count({ where: { companyId } }),
      prisma.user.findMany({
        where: { companyId },
        select: { name: true },
        take: 20,
      }),
      prisma.record.groupBy({
        by: ["tableId"],
        where: { companyId },
        _count: true,
      }),
    ]);

    const validTableIds = new Set(userTables.map((t: any) => t.id));
    const recordCountMap = new Map(recordCounts.map((r: any) => [r.tableId, r._count]));

    // Build structured formattedTables with columns, recordCount
    const formattedTables = tables
      .filter((t: any) => validTableIds.has(t.id))
      .map((t: any) => {
        const dbTable = userTables.find((ut: any) => ut.id === t.id);
        let rawColumns: any[] = [];
        const schemaSource = dbTable?.schemaJson || t.schemaJson;
        if (schemaSource) {
          let schema = schemaSource;
          if (typeof schema === "string") {
            try { schema = JSON.parse(schema); } catch (e) {}
          }
          if (Array.isArray(schema)) rawColumns = schema;
          else if (schema.columns && Array.isArray(schema.columns)) rawColumns = schema.columns;
        }
        // Structured columns with systemName, label, type, options
        const columns = rawColumns.map((c: any) => ({
          systemName: c.systemName || c.name,
          label: c.label || c.name,
          type: c.type || "text",
          ...(Array.isArray(c.options) && c.options.length > 0 ? { options: c.options.slice(0, 20) } : {}),
        }));
        return {
          id: t.id,
          name: dbTable?.name || t.name,
          columns,
          recordCount: recordCountMap.get(t.id) || 0,
        };
      });

    // Fetch sample data for up to 3 tables (parallel)
    const tablesToSample = formattedTables.slice(0, 3);
    if (tablesToSample.length > 0) {
      const sampleResults = await Promise.all(
        tablesToSample.map((t: any) =>
          prisma.record.findMany({
            where: { tableId: t.id, companyId },
            select: { data: true },
            take: 2,
            orderBy: { createdAt: "desc" },
          })
        )
      );
      tablesToSample.forEach((t: any, i: number) => {
        t.sampleData = sampleResults[i].map((r: any) => r.data);
      });
    }

    // Build enriched context
    const enrichedContext: Record<string, any> = {
      formattedTables,
      orgInfo: {
        companyName: companyInfo?.name || "העסק",
        businessType: companyInfo?.businessType || "",
      },
      systemModels: {
        Task: { count: taskCount },
        Retainer: { count: retainerCount },
        OneTimePayment: { count: paymentCount },
        Transaction: { count: transactionCount },
        CalendarEvent: { count: eventCount },
      },
      clientCount,
      teamMembers: teamMembers.map((m: any) => m.name).filter(Boolean),
      existingViews: existingViews.map((v: any) => ({
        title: v.title,
        type: v.type,
      })),
    };

    // For refine mode, include currentReport in context
    if (mode === "refine" && currentReport) {
      enrichedContext.currentReport = currentReport;
    }

    // For single-refine mode, include currentView in context
    if (mode === "single-refine" && currentView) {
      enrichedContext.currentView = currentView;
    }

    // Determine Inngest event type based on mode
    const eventType = mode === "single" ? "analytics"
      : mode === "single-refine" ? "analytics-single-refine"
      : mode === "refine" ? "analytics-report-refine"
      : mode === "suggestions" ? "analytics-suggestions"
      : "analytics-report";

    // Payload size guard
    const eventData: Record<string, any> = {
      jobId: "",
      type: eventType,
      prompt,
      context: enrichedContext,
      companyId,
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
    log.error("Failed to dispatch analytics generation", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
