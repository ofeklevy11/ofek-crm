import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Rate limit bulk operations per user
    const rateLimited = await checkRateLimit(String(currentUser.id), RATE_LIMITS.bulk);
    if (rateLimited) return rateLimited;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { action, recordIds } = body;

    if (!recordIds || !Array.isArray(recordIds)) {
      return NextResponse.json(
        { error: "Invalid record IDs" },
        { status: 400 },
      );
    }

    if (action === "delete") {
      if (recordIds.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      const { canWriteTable } = await import("@/lib/permissions");

      const validIds = recordIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      if (validIds.length > 5000) {
        return NextResponse.json(
          { error: "Cannot delete more than 5000 records at once" },
          { status: 400 },
        );
      }

      // Verify all records belong to the same table and check permission
      const distinctTables = await prisma.record.groupBy({
        by: ["tableId"],
        where: { id: { in: validIds }, companyId: currentUser.companyId },
      });

      if (distinctTables.length === 0) {
        return NextResponse.json({ success: true });
      }

      if (distinctTables.length > 1) {
        return NextResponse.json(
          { error: "All records must belong to the same table" },
          { status: 400 },
        );
      }

      const tableId = distinctTables[0].tableId;

      if (!canWriteTable(currentUser, tableId)) {
        return NextResponse.json(
          { error: "You don't have permission to delete records from this table" },
          { status: 403 },
        );
      }

      // Offload to Inngest background job for scalable processing
      await inngest.send({
        id: `bulk-delete-${currentUser.companyId}-${tableId}-${Date.now()}`,
        name: "records/bulk-delete",
        data: {
          recordIds: validIds,
          companyId: currentUser.companyId,
          tableId,
          userId: currentUser.id,
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "bulk action");
  }
}
