import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);
    const body = await request.json();
    const { data, updatedBy, createdAt } = body;

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Check write permissions
    if (updatedBy) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordId },
        select: { tableId: true },
      });

      if (existingRecord) {
        const { getUserById, canWriteTable } = await import(
          "@/lib/permissions"
        );
        const user = await getUserById(Number(updatedBy));

        if (!user || !canWriteTable(user, existingRecord.tableId)) {
          return NextResponse.json(
            { error: "You don't have permission to write to this table" },
            { status: 403 }
          );
        }
      }
    }

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        data,
        updatedBy: updatedBy ? Number(updatedBy) : null,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(
      record.id,
      updatedBy ? Number(updatedBy) : null,
      "UPDATE",
      data
    );

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error updating record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);
    const body = await request.json();
    const { deletedBy } = body;

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Check write permissions
    if (deletedBy) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordId },
        select: { tableId: true },
      });

      if (existingRecord) {
        const { getUserById, canWriteTable } = await import(
          "@/lib/permissions"
        );
        const user = await getUserById(Number(deletedBy));

        if (!user || !canWriteTable(user, existingRecord.tableId)) {
          return NextResponse.json(
            { error: "You don't have permission to write to this table" },
            { status: 403 }
          );
        }
      }
    }

    await prisma.record.delete({
      where: { id: recordId },
    });

    await createAuditLog(recordId, null, "DELETE");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}
