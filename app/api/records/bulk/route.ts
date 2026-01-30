import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, recordIds } = body;

    if (!recordIds || !Array.isArray(recordIds)) {
      return NextResponse.json(
        { error: "Invalid record IDs" },
        { status: 400 },
      );
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (action === "delete") {
      // Check permissions
      if (recordIds.length > 0) {
        const { canWriteTable } = await import("@/lib/permissions");

        // SECURITY: Check permission and verify record belongs to user's company
        const firstRecord = await prisma.record.findFirst({
          where: { id: Number(recordIds[0]), companyId: currentUser.companyId },
          select: { tableId: true },
        });

        if (firstRecord) {
          if (!canWriteTable(currentUser, firstRecord.tableId)) {
            return NextResponse.json(
              {
                error:
                  "You don't have permission to delete records from this table",
              },
              { status: 403 },
            );
          }
        } else {
          return NextResponse.json(
            { error: "Record not found or access denied" },
            { status: 404 },
          );
        }
      }

      // Perform deletion in a transaction to handle constraints manually
      try {
        const result = await prisma.$transaction(async (tx) => {
          const ids = recordIds.map((id: any) => Number(id));

          // 1. Delete Attachments (Legacy Links) - No CASCADE in schema
          await tx.attachment.deleteMany({
            where: { recordId: { in: ids } },
          });

          // 2. Unlink AuditLogs - No CASCADE in schema (Keep logging but remove relation)
          await tx.auditLog.updateMany({
            where: { recordId: { in: ids } },
            data: { recordId: null },
          });

          // 3. Delete Records
          // SECURITY: Filter by companyId to prevent cross-tenant deletion
          const deleteResult = await tx.record.deleteMany({
            where: {
              id: { in: ids },
              companyId: currentUser.companyId,
            },
          });

          return deleteResult;
        });

        // Log bulk delete (Audit logs for the action itself)
        // Note: The previous audit logs for the records are now unlinked but exist.
        for (const id of recordIds) {
          await createAuditLog(null, currentUser.id, "DELETE (BULK)", {
            previousRecordId: id,
          });
        }

        return NextResponse.json({ success: true, count: result });
      } catch (dbError: any) {
        console.error("Database error during bulk delete:", dbError);

        // Provide more specific error message based on Prisma error
        let errorMessage = "Failed to delete records due to database error";
        if (dbError.code === "P2003") {
          errorMessage =
            "Cannot delete record because it is referenced by another entity (Foreign Key Violation). Please check for related data.";
        }

        return NextResponse.json(
          { error: errorMessage, details: dbError.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error performing bulk action:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action", details: error.message },
      { status: 500 },
    );
  }
}
