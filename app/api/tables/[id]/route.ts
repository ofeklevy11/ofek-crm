import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables, canReadTable } from "@/lib/permissions";

// P7: Validate and parse route param early — reject NaN before hitting DB
function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // P2: Check read permission before querying
    if (!canReadTable(user, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P8: Exclude soft-deleted tables
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableId,
        companyId: user.companyId,
        deletedAt: null,
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
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, slug, schemaJson, updatedAt: expectedUpdatedAt } = body;

    // P9: Only select id — full row not needed for existence check
    if (body.categoryId !== undefined && body.categoryId !== null) {
      const category = await prisma.tableCategory.findFirst({
        where: { id: body.categoryId, companyId: user.companyId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
    }

    // P4 + P5: Use updateMany with optimistic concurrency check in a single query
    //   — eliminates the redundant findFirst while supporting updatedAt guard
    const where: any = {
      id: tableId,
      companyId: user.companyId,
      deletedAt: null,
    };
    if (expectedUpdatedAt) {
      where.updatedAt = new Date(expectedUpdatedAt);
    }

    const { count } = await prisma.tableMeta.updateMany({
      where,
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(schemaJson && { schemaJson }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        updatedAt: new Date(),  // updateMany doesn't auto-set @updatedAt
      },
    });

    if (count === 0) {
      // Distinguish between not-found and optimistic-concurrency conflict
      if (expectedUpdatedAt) {
        const exists = await prisma.tableMeta.findFirst({
          where: { id: tableId, companyId: user.companyId, deletedAt: null },
          select: { id: true },
        });
        if (exists) {
          return NextResponse.json(
            { error: "Conflict: the table was modified by another user. Please refresh and try again." },
            { status: 409 }
          );
        }
      }
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Return the updated record
    const updatedTable = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId, deletedAt: null },
    });

    return NextResponse.json(updatedTable);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "slug כבר קיים בחברה זו" },
        { status: 409 }
      );
    }
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
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // P1 + P8: All checks and soft-delete inside a single transaction
    await prisma.$transaction(async (tx) => {
      const existingTable = await tx.tableMeta.findFirst({
        where: { id: tableId, companyId: user.companyId, deletedAt: null },
        select: { id: true, companyId: true, slug: true },
      });

      if (!existingTable) {
        throw new Error("TABLE_NOT_FOUND");
      }

      // P1: File check INSIDE the transaction — no race window
      const fileCount = await tx.file.count({
        where: {
          record: {
            tableId,
            companyId: existingTable.companyId,
          },
        },
      });

      if (fileCount > 0) {
        throw new Error("HAS_FILES");
      }

      // P8: Soft delete — mangle slug to free the unique constraint
      await tx.tableMeta.update({
        where: { id: tableId, companyId: user.companyId },
        data: {
          deletedAt: new Date(),
          slug: `${existingTable.slug}_deleted_${Date.now()}`,
        },
      });
    }, { maxWait: 5000, timeout: 60000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "TABLE_NOT_FOUND") {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
    if (error.message === "HAS_FILES") {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש רשומות עם קבצים מצורפים. יש למחוק את הקבצים תחילה (מספריית הקבצים או מהרשומות).",
        },
        { status: 400 }
      );
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש לה קבצים מצורפים / לינקים  או מידע מקושר אחר. יש למחוק את הלינקים והרשומות באופן ידני לפני מחיקת הטבלה.",
        },
        { status: 400 }
      );
    }

    console.error("Error deleting table:", error);
    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}
