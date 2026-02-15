import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { withRetry } from "@/lib/db-retry";
import { handlePrismaError } from "@/lib/prisma-error";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recordId = parseId(id);

    if (!recordId) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canReadTable } = await import("@/lib/permissions");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // CRITICAL: Filter by companyId
    const record = await withRetry(() => prisma.record.findFirst({
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
    }));

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (!canReadTable(currentUser, record.tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const recordId = parseId(id);

    if (!recordId) {
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

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { data, createdAt } = body;

    // Atomic verify + update in a transaction to prevent TOCTOU race
    // CRITICAL: Filter by companyId
    const txResult = await withRetry(() => prisma.$transaction(async (tx) => {
      const existingRecord = await tx.record.findFirst({
        where: {
          id: recordId,
          companyId: currentUser.companyId,
        },
      });

      if (!existingRecord) {
        return { error: "Record not found", status: 404 } as const;
      }

      if (!canWriteTable(currentUser, existingRecord.tableId)) {
        return { error: "You don't have permission to write to this table", status: 403 } as const;
      }

      const record = await tx.record.update({
        where: { id: recordId, companyId: currentUser.companyId },
        data: {
          data,
          updatedBy: currentUser.id,
          ...(createdAt && { createdAt: new Date(createdAt) }),
        },
      });

      await createAuditLog(record.id, currentUser.id, "UPDATE", data, tx, currentUser.companyId);

      return { record, existingRecord } as const;
    }));

    if ("error" in txResult) {
      return NextResponse.json({ error: txResult.error }, { status: txResult.status });
    }

    const { record, existingRecord } = txResult;

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
    return handlePrismaError(error, "record");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recordId = parseId(id);

    if (!recordId) {
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
    const existingRecord = await withRetry(() => prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
      select: { tableId: true },
    }));

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
    return handlePrismaError(error, "record");
  }
}
