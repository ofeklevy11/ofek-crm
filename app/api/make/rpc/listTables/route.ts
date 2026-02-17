import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTables");



export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-company-api-key") || url.searchParams.get("apiKey");
    if (!apiKey) {
      return NextResponse.json([{ label: "-- Enter API Key first --", value: "__no_key__" }]);
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

    // Make RPC expects: [{ label, value }]
    return NextResponse.json(
      tables.map((t) => ({ label: t.name, value: t.slug })),
    );
  } catch (error) {
    log.error("RPC tables failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
