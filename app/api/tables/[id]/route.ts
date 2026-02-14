import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // CRITICAL: Filter by companyId
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: parseInt(id),
        companyId: user.companyId,
      },
      include: {
        _count: {
          select: { records: true },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    return NextResponse.json(table);
  } catch (error) {
    console.error("Error fetching table:", error);
    return NextResponse.json(
      { error: "Failed to fetch table" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canManageTables } = await import("@/lib/permissions");
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json(
        { error: "Forbidden: Only admins can update tables" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, slug, schemaJson } = body;

    // CRITICAL: Check if table exists AND belongs to company
    const existingTable = await prisma.tableMeta.findFirst({
      where: {
        id: parseInt(id),
        companyId: user.companyId,
      },
    });

    if (!existingTable) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // SECURITY: Validate categoryId belongs to user's company before assignment
    if (body.categoryId !== undefined && body.categoryId !== null) {
      const category = await prisma.tableCategory.findFirst({
        where: { id: body.categoryId, companyId: user.companyId },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
    }

    // SECURITY: Atomic companyId check in update WHERE clause
    const updatedTable = await prisma.tableMeta.update({
      where: { id: parseInt(id), companyId: user.companyId },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(schemaJson && { schemaJson }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      },
    });

    return NextResponse.json(updatedTable);
  } catch (error) {
    console.error("Error updating table:", error);
    return NextResponse.json(
      { error: "Failed to update table" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canManageTables } = await import("@/lib/permissions");
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json(
        { error: "Forbidden: Only admins can delete tables" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // CRITICAL: Check if table exists AND belongs to company
    const existingTable = await prisma.tableMeta.findFirst({
      where: {
        id: parseInt(id),
        companyId: user.companyId,
      },
    });

    if (!existingTable) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Check for associated files
    const fileCount = await prisma.file.count({
      where: {
        record: {
          tableId: parseInt(id),
          companyId: existingTable.companyId,
        },
      },
    });

    if (fileCount > 0) {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש רשומות עם קבצים מצורפים. יש למחוק את הקבצים תחילה (מספריית הקבצים או מהרשומות).",
        },
        { status: 400 }
      );
    }

    // Clean up orphaned FinanceRecords linked to records in this table
    const tableIdNum = parseInt(id);
    const syncRules = await prisma.financeSyncRule.findMany({
      where: { sourceType: "TABLE", sourceId: tableIdNum, companyId: existingTable.companyId },
      select: { id: true },
    });
    if (syncRules.length > 0) {
      const recordIds = await prisma.record.findMany({
        where: { tableId: tableIdNum, companyId: existingTable.companyId },
        select: { id: true },
        take: 50000, // P221: Safety cap — prevents unbounded ID array in memory
      });
      if (recordIds.length > 0) {
        await prisma.financeRecord.deleteMany({
          where: {
            companyId: existingTable.companyId,
            syncRuleId: { in: syncRules.map((r) => r.id) },
            originId: { in: recordIds.map((r) => r.id.toString()) },
          },
        });
      }
    }

    // Delete all records
    await prisma.record.deleteMany({
      where: { tableId: tableIdNum, companyId: existingTable.companyId },
    });

    // SECURITY: Atomic companyId check in delete WHERE clause
    await prisma.tableMeta.delete({
      where: { id: parseInt(id), companyId: user.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting table:", error);
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש לה קבצים מצורפים / לינקים  או מידע מקושר אחר. יש למחוק את הלינקים והרשומות באופן ידני לפני מחיקת הטבלה.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}
