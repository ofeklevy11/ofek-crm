import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { processNewRecordTrigger } from "@/app/actions/automations";

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

    // Check write permissions
    if (createdBy) {
      const { getUserById, canWriteTable } = await import("@/lib/permissions");
      const user = await getUserById(Number(createdBy));

      if (!user || !canWriteTable(user, tableId)) {
        return NextResponse.json(
          { error: "You don't have permission to write to this table" },
          { status: 403 }
        );
      }
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

    // Trigger automations
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { name: true },
    });

    if (table) {
      // Don't await strictly to not block response
      processNewRecordTrigger(tableId, table.name, record.id).catch(
        console.error
      );
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error creating record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}
