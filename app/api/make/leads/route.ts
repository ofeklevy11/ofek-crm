import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Authentication Check
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    const authHeader = req.headers.get("x-api-secret");

    if (!secret || authHeader !== secret) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing secret key" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // Extract table identifier and other system fields if necessary
    // We expect 'table_slug' to identify the target table
    const { table_slug, ...recordData } = body;

    if (!table_slug) {
      return NextResponse.json(
        { error: "Missing table_slug in request body" },
        { status: 400 }
      );
    }

    // Find the table by slug
    const table = await prisma.tableMeta.findUnique({
      where: { slug: table_slug },
    });

    if (!table) {
      return NextResponse.json(
        { error: `Table with slug "${table_slug}" not found` },
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
