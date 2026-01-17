import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // CRITICAL: Filter by companyId
    const record = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        updater: {
          select: { id: true, name: true, email: true },
        },
        files: true,
        attachments: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error fetching record:", error);
    return NextResponse.json(
      { error: "Failed to fetch record" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);
    const body = await request.json();
    const { data, createdAt } = body;

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canWriteTable } = await import("@/lib/permissions");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check write permissions and fetch existing record for automations
    // CRITICAL: Filter by companyId
    const existingRecord = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
    });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (!canWriteTable(currentUser, existingRecord.tableId)) {
      return NextResponse.json(
        { error: "You don't have permission to write to this table" },
        { status: 403 }
      );
    }

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        data,
        updatedBy: currentUser.id,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(record.id, currentUser.id, "UPDATE", data);

    // Trigger Automations
    console.log(
      `[API Records] About to trigger automations for record ${record.id}, table ${record.tableId}`
    );
    try {
      const { processRecordUpdate } = await import("@/app/actions/automations");
      // Run in background / parallel to not block response?
      // Ideally await to ensure it runs, but errors shouldn't fail the request.
      await processRecordUpdate(
        record.tableId,
        record.id,
        existingRecord.data as any,
        data
      );
      console.log(`[API Records] Successfully triggered automations`);
    } catch (autoError) {
      console.error("Failed to process automations:", autoError);
    }

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

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canWriteTable } = await import("@/lib/permissions");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check write permissions
    // CRITICAL: Filter by companyId
    const existingRecord = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
      select: { tableId: true },
    });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (!canWriteTable(currentUser, existingRecord.tableId)) {
      return NextResponse.json(
        { error: "You don't have permission to write to this table" },
        { status: 403 }
      );
    }

    await prisma.record.delete({
      where: { id: recordId },
    });

    await createAuditLog(recordId, currentUser.id, "DELETE");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}
