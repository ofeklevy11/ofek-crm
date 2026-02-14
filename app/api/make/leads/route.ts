import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // 1. Authentication Check
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    const authHeader = req.headers.get("x-api-secret");
    const apiKey = req.headers.get("x-company-api-key");

    if (!secret || authHeader !== secret) {
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

    const body = await req.json();

    // Always derive companyId from the validated API key — never from request body
    const companyId = keyRecord.companyId;

    // Extract table identifier and strip system fields from record data
    const { table_slug, company_id: _ignoredCompanyId, ...recordData } = body;

    if (!table_slug) {
      return NextResponse.json(
        { error: "Missing table_slug in request body" },
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
        {
          error: `Table with slug "${table_slug}" not found`,
        },
        { status: 404 }
      );
    }

    // Create the record in the found table
    const record = await prisma.record.create({
      data: {
        companyId: table.companyId,
        tableId: table.id,
        data: recordData, // The rest of the body is saved as the record's data
      },
    });

    return NextResponse.json({ success: true, record });
  } catch (error) {
    console.error("Error creating record:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
