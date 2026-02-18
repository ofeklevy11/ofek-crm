import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeVerify");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-company-api-key") || url.searchParams.get("apiKey");

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

    // Return apiKey so Make can store it in the connection
    return NextResponse.json({ apiKey });
  } catch (error) {
    log.error("Verify failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}