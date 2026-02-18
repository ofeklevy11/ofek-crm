import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTableFields");

// Simple in-memory cache for Make RPC calls that arrive without apiKey
const fieldsCache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Map CRM column types to Make parameter types */
function mapColumnType(crmType: string): string {
  switch (crmType) {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "select":
      return "select";
    default:
      return "text";
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-company-api-key") || url.searchParams.get("apiKey");
    const tableSlug = url.searchParams.get("table_slug");

    // If no valid apiKey, return cached result if available
    if (!apiKey || apiKey === "null") {
      if (tableSlug) {
        const cacheKey = `_:${tableSlug}`;
        for (const [key, cached] of fieldsCache) {
          if (key.endsWith(`:${tableSlug}`) && Date.now() - cached.ts < CACHE_TTL) {
            log.info("Returning cached fields", { tableSlug, count: cached.data.length });
            return NextResponse.json(cached.data);
          }
        }
      }
      return NextResponse.json([]);
    }

    const keyRecord = await findApiKeyByValue(apiKey);
    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401 },
      );
    }

    const rateLimited = await checkRateLimit(
      String(keyRecord.companyId),
      RATE_LIMITS.api,
    );
    if (rateLimited) return rateLimited;

    // If no table selected yet, return empty array
    if (!tableSlug) {
      return NextResponse.json([]);
    }

    // Validate slug format (allow alphanumeric, dashes, and underscores)
    if (tableSlug.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(tableSlug)) {
      return NextResponse.json(
        { error: "Invalid table_slug format" },
        { status: 400 },
      );
    }

    const table = await prisma.tableMeta.findFirst({
      where: {
        companyId: keyRecord.companyId,
        slug: tableSlug,
        deletedAt: null,
      },
      select: { schemaJson: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Parse schemaJson → columns
    let columns: any[] = [];
    const schema = table.schemaJson as any;
    if (Array.isArray(schema)) {
      columns = schema;
    } else if (schema?.columns && Array.isArray(schema.columns)) {
      columns = schema.columns;
    }

    // Build Make-compatible parameter array
    const fields: Array<Record<string, any>> = [];

    columns
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((col: any) => {
        const key = col.key || col.id;
        const field: Record<string, any> = {
          name: key,
          type: mapColumnType(col.type),
          label: col.name,
        };

        if (col.type === "select" && Array.isArray(col.options)) {
          field.options = col.options.map((opt: string) => ({
            label: opt,
            value: opt,
          }));
        }

        fields.push(field);
      });

    // Cache the result
    const cacheKey = `${keyRecord.companyId}:${tableSlug}`;
    fieldsCache.set(cacheKey, { data: fields, ts: Date.now() });

    return NextResponse.json(fields);
  } catch (error) {
    log.error("RPC table-fields failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}