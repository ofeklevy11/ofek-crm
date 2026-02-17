import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const log = createLogger("MakeVerify");

export async function GET(req: Request) {
  try {
    const apiKey = req.headers.get("x-company-api-key");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing x-company-api-key header" },
        { status: 401 }
      );
    }

    const keyRecord = await findApiKeyByValue(apiKey);
    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or inactive Company API Key" },
        { status: 401 }
      );
    }

    const companyId = keyRecord.companyId;
    const rateLimited = await checkRateLimit(String(companyId), RATE_LIMITS.api);
    if (rateLimited) return rateLimited;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    log.info(`Connection verified for company ${company.name} (${company.id})`);

    return NextResponse.json({
      success: true,
      token: apiKey,
      company: { id: company.id, name: company.name },
    });
  } catch (error) {
    log.error("Verify connection failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}