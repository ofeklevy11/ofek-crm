import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeLeads");
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { verifyWebhookSecret, checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";

export async function POST(req: Request) {
  try {
    // 1. Authentication Check (timing-safe comparison)
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    const authHeader = req.headers.get("x-api-secret");
    const apiKey = req.headers.get("x-company-api-key");

    if (!verifyWebhookSecret(authHeader, secret)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing secret key" },
        { status: 401 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing x-company-api-key header" },
        { status: 401 }
      );
    }

    // Validate Company API Key (looked up by hash)
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
    const { table_slug, company_id: _ignoredCompanyId, ...recordData } = body;

    // Validate table_slug: non-empty string, max 100 chars, alphanumeric + dashes only
    if (
      !table_slug ||
      typeof table_slug !== "string" ||
      table_slug.length > 100 ||
      !/^[a-zA-Z0-9-]+$/.test(table_slug)
    ) {
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
