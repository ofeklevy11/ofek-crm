import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

    // Validate Company API Key
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey },
    });

    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or inactive Company API Key" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // Verify company scope
    // We already extracted table_slug, now we verify company_id match
    if (body.company_id && Number(body.company_id) !== keyRecord.companyId) {
      return NextResponse.json(
        { error: "Forbidden: API Key does not match the requested company_id" },
        { status: 403 }
      );
    }

    // If company_id was NOT sent in body, we can actually infer it!
    // But previous requirement said 'make company_id mandatory in body'.
    // So we just enforce consistency.

    // Extract table identifier and other system fields
    const { table_slug, company_id, ...recordData } = body;

    if (!table_slug) {
      return NextResponse.json(
        { error: "Missing table_slug in request body" },
        { status: 400 }
      );
    }

    if (!company_id) {
      return NextResponse.json(
        { error: "Missing company_id in request body" },
        { status: 400 }
      );
    }

    // Find the table by slug AND companyId
    // We use findFirst because slugs might not be globally unique anymore (unique per company)
    const table = await prisma.tableMeta.findFirst({
      where: {
        slug: table_slug,
        companyId: Number(company_id),
      },
    });

    if (!table) {
      return NextResponse.json(
        {
          error: `Table with slug "${table_slug}" not found in company ${company_id}`,
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
