import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey, verifyRpcToken } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("MakeRpcTables");

async function handleListTables(req: Request) {
  try {
    let body: any = null;
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* no body or invalid JSON */ }
    }

    const auth = await validateMakeApiKey(req, body?.apiKey);
    let companyId: number;

    if (auth.success) {
      companyId = auth.keyRecord.companyId;
    } else {
      // Fallback: rpcToken from query or body
      const url = new URL(req.url);
      const rpcToken = url.searchParams.get("rpcToken") || body?.rpcToken;
      const tokenCompanyId = rpcToken ? verifyRpcToken(rpcToken) : null;
      if (!tokenCompanyId) return NextResponse.json([]);
      companyId = tokenCompanyId;
    }

    const rateLimited = await checkRateLimit(
      String(companyId),
      RATE_LIMITS.api,
    );
    if (rateLimited) return rateLimited;

    const tables = await prisma.tableMeta.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
      take: 200,
    });

    const result = tables.map((t) => ({ label: t.name, value: t.slug }));

    log.info("listTables result", {
      companyId,
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

export const GET = withMetrics("/api/make/rpc/listTables", handleListTables);
export const POST = withMetrics("/api/make/rpc/listTables", handleListTables);
