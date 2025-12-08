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
        { status: 400 }
      );
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (action === "delete") {
      // Check permissions
      if (recordIds.length > 0) {
        const { canWriteTable } = await import("@/lib/permissions");

        // Check permission on the first record (assuming all belong to same table or user has general access)
        const firstRecord = await prisma.record.findUnique({
          where: { id: Number(recordIds[0]) },
          select: { tableId: true },
        });

        if (firstRecord) {
          if (!canWriteTable(currentUser, firstRecord.tableId)) {
            return NextResponse.json(
              {
                error:
                  "You don't have permission to delete records from this table",
              },
              { status: 403 }
            );
          }
        }
      }

      // Log before delete or after? After is better but we lose data.
      // For bulk delete, we might just log IDs.

      const count = await prisma.record.deleteMany({
        where: {
          id: {
            in: recordIds.map((id: any) => Number(id)),
          },
        },
      });

      // Log bulk delete
      for (const id of recordIds) {
        await createAuditLog(Number(id), currentUser.id, "DELETE (BULK)");
      }

      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
