import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTables");

// Simple in-memory cache for Make RPC calls that arrive without apiKey
const tablesCache = new Map<number, { data: any[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-company-api-key") || url.searchParams.get("apiKey");

    log.info("listTables called", {
      hasApiKey: !!apiKey,
      apiKeyIsNull: apiKey === "null",
    });

    // If no valid apiKey, return cached result if available
    if (!apiKey || apiKey === "null") {
      // Return most recent cached result (for Make refresh calls)
      for (const [companyId, cached] of tablesCache) {
        if (Date.now() - cached.ts < CACHE_TTL) {
          log.info("Returning cached tables", { companyId, count: cached.data.length });
          return NextResponse.json(cached.data);
        }
      }
      log.warn("No cached tables available — returning empty array");
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

    const tables = await prisma.tableMeta.findMany({
      where: {
        companyId: keyRecord.companyId,
        deletedAt: null,
      },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
      take: 200,
    });

    const result = tables.map((t) => ({ label: t.name, value: t.slug }));

    // Cache the result for subsequent calls without apiKey
    tablesCache.set(keyRecord.companyId, { data: result, ts: Date.now() });

    log.info("listTables result", {
      companyId: keyRecord.companyId,
      count: tables.length,
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error("RPC tables failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}