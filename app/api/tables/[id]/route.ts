import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const table = await prisma.tableMeta.findUnique({
      where: { id: parseInt(id) },
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
    const { getCurrentUser, canManageTables } = await import(
      "@/lib/permissions"
    );
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

    // Check if table exists
    const existingTable = await prisma.tableMeta.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingTable) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Update table
    const updatedTable = await prisma.tableMeta.update({
      where: { id: parseInt(id) },
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
    const { getCurrentUser, canManageTables } = await import(
      "@/lib/permissions"
    );
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

    // Check if table exists
    const existingTable = await prisma.tableMeta.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingTable) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Delete all records first
    await prisma.record.deleteMany({
      where: { tableId: parseInt(id) },
    });

    // Delete table
    await prisma.tableMeta.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting table:", error);
    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}
