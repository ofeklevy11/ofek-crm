import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 401 },
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
        dialedBy: {
          select: { id: true, name: true, email: true },
        },
        files: true,
        attachments: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Strip raw storage URLs from files — clients must use proxied download endpoints
    // Attachments keep their url because they are user-entered links, not storage secrets
    const sanitized = {
      ...record,
      attachments: record.attachments.map((att) => ({
        ...att,
        downloadUrl: `/api/attachments/${att.id}/download`,
      })),
      files: record.files.map(({ url, key, ...file }) => ({
        ...file,
        downloadUrl: `/api/files/${file.id}/download`,
      })),
    };

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error fetching record:", error);
    return NextResponse.json(
      { error: "Failed to fetch record" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 401 },
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
        { status: 403 },
      );
    }

    // SECURITY: Atomic companyId check in update WHERE clause
    const record = await prisma.record.update({
      where: { id: recordId, companyId: currentUser.companyId },
      data: {
        data,
        updatedBy: currentUser.id,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(record.id, currentUser.id, "UPDATE", data, undefined, currentUser.companyId);

    // Trigger Automations (async via Inngest)
    console.log(
      `[API Records] Sending automation event for record ${record.id}, table ${record.tableId}`,
    );
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `api-record-update-${currentUser.companyId}-${record.id}-${Math.floor(Date.now() / 1000)}`,
        name: "automation/record-update",
        data: {
          tableId: record.tableId,
          recordId: record.id,
          oldData: existingRecord.data as Record<string, unknown>,
          newData: data,
          companyId: currentUser.companyId,
        },
      });
      console.log(`[API Records] Successfully sent automation event`);
    } catch (autoError) {
      console.error("Failed to send automation event:", autoError);
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error updating record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 401 },
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
        { status: 403 },
      );
    }

    const { deleteRecordWithCleanup } = await import("@/lib/record-cleanup");
    await deleteRecordWithCleanup(recordId, {
      companyId: currentUser.companyId,
      tableId: existingRecord.tableId,
      userId: currentUser.id,
    });

    // Refresh dashboard widgets after delete (matches server action behavior)
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `api-dash-refresh-${currentUser.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId: currentUser.companyId },
      });
    } catch (e) {
      console.error("[Records API] Failed to send dashboard refresh:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 },
    );
  }
}
