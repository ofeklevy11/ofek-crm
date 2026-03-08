import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { validateMakeApiKey } from "@/lib/make-auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("MakeLeads");

async function handlePOST(req: Request) {
  try {
    // 1. Validate per-company API key
    const auth = await validateMakeApiKey(req);
    if (!auth.success) return auth.response;
    const { keyRecord } = auth;

    // Rate limit per company
    const rateLimited = await checkRateLimit(String(keyRecord.companyId), RATE_LIMITS.webhook);
    if (rateLimited) return rateLimited;

    // Idempotency: if X-Idempotency-Key header is present, deduplicate
    const { key: idempotencyKey, cachedResponse } = await checkIdempotencyKey(req, "leads");
    if (cachedResponse) return cachedResponse;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Always derive companyId from the validated API key — never from request body
    const companyId = keyRecord.companyId;

    // Extract table identifier and strip system fields from record data
    const { table_slug, company_id: _ignoredCompanyId, apiKey: _ignoredApiKey, ...recordData } = body;

    log.info("Incoming request", { table_slug, recordData, apiKey: "present" });

    // Validate table_slug: non-empty string, max 100 chars, alphanumeric + dashes + underscores
    if (
      !table_slug ||
      typeof table_slug !== "string" ||
      table_slug.length > 100 ||
      !/^[a-zA-Z0-9_-]+$/.test(table_slug)
    ) {
      log.error("Invalid table_slug", { table_slug, type: typeof table_slug });
      return NextResponse.json(
        { error: "Invalid or missing table_slug" },
        { status: 400 }
      );
    }

    // Validate recordData size (max 50KB serialized)
    const serializedSize = JSON.stringify(recordData).length;
    if (serializedSize > 50_000) {
      return NextResponse.json(
        { error: "Record data too large (max 50KB)" },
        { status: 400 }
      );
    }

    // Find the table by slug scoped to the API key's company
    const table = await prisma.tableMeta.findFirst({
      where: {
        slug: table_slug,
        companyId,
      },
    });

    if (!table) {
      return NextResponse.json(
        { error: "Table not found" },
        { status: 404 }
      );
    }

    // Create the record in the found table
    const record = await prisma.record.create({
      data: {
        companyId: table.companyId,
        tableId: table.id,
        data: recordData,
      },
    });

    const responseBody = { success: true, record };
    if (idempotencyKey) await setIdempotencyResult("leads", idempotencyKey, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    log.error("Failed to create record via webhook", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = withMetrics("/api/make/leads", handlePOST);
