import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTables");

export async function GET(req: Request) {
  try {
    const auth = await validateMakeApiKey(req);
    if (!auth.success) return auth.response;
    const { keyRecord } = auth;

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
