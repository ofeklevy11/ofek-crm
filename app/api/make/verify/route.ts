import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { extractMakeApiKey, generateRpcToken } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("MakeVerify");

async function handleOPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "x-company-api-key, Content-Type",
    },
  });
}

async function handleGET(req: Request) {
  try {
    const apiKey = extractMakeApiKey(req);

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API Key" },
        { status: 401 },
      );
    }

    const keyRecord = await findApiKeyByValue(apiKey);
    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Invalid API Key" },
        { status: 401 },
      );
    }

    log.info("API Key verified", { companyId: keyRecord.companyId });

    return NextResponse.json({
      apiKey,
      companyId: keyRecord.companyId,
      rpcToken: generateRpcToken(keyRecord.companyId),
    });
  } catch (error) {
    log.error("Verify failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export const OPTIONS = withMetrics("/api/make/verify", handleOPTIONS);
export const GET = withMetrics("/api/make/verify", handleGET);
