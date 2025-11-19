import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tableId = parseInt(id);

    if (isNaN(tableId)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const records = await prisma.record.findMany({
      where: { tableId },
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Error fetching records:", error);
    return NextResponse.json(
      { error: "Failed to fetch records" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tableId = parseInt(id);
    const body = await request.json();
    const { data, createdBy } = body;

    if (isNaN(tableId)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const record = await prisma.record.create({
      data: {
        tableId,
        data: data || {},
        createdBy: createdBy ? Number(createdBy) : null,
      },
    });

    await createAuditLog(
      record.id,
      createdBy ? Number(createdBy) : null,
      "CREATE",
      data
    );

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error creating record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}
