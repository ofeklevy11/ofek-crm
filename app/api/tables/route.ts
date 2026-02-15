import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const cursorId = cursor ? parseInt(cursor, 10) : null;
    if (cursor && (!Number.isFinite(cursorId) || cursorId! <= 0)) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    if (!Number.isInteger(limit) || limit <= 0) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }

    // P2: Permission-aware WHERE — basic users only see tables they have access to
    const where: any = { companyId: user.companyId, deletedAt: null };
    if (user.role !== "admin" && user.role !== "manager") {
      const allowedIds = user.tablePermissions
        ? Object.entries(user.tablePermissions)
            .filter(([, p]) => p === "read" || p === "write")
            .map(([id]) => parseInt(id))
        : [];
      where.id = { in: allowedIds };
    }

    // P3: Cursor-based pagination
    const tables = await prisma.tableMeta.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hasMore = tables.length > limit;
    const data = hasMore ? tables.slice(0, limit) : tables;

    return NextResponse.json({
      data,
      hasMore,
      nextCursor: hasMore ? data[data.length - 1]?.id : undefined,
    });
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json(
      { error: "Failed to fetch tables" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json(
        { error: "אין לך הרשאה ליצור טבלאות" },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, slug, schemaJson } = body;

    // Basic validation
    if (!name || !slug) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // SECURITY: Validate categoryId belongs to user's company
    let validatedCategoryId: number | undefined;
    if (body.categoryId) {
      const category = await prisma.tableCategory.findFirst({
        where: { id: Number(body.categoryId), companyId: user.companyId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: "Invalid category" },
          { status: 400 }
        );
      }
      validatedCategoryId = category.id;
    }

    const table = await prisma.tableMeta.create({
      data: {
        name,
        slug,
        schemaJson: schemaJson || {},
        companyId: user.companyId,
        createdBy: user.id,
        categoryId: validatedCategoryId,
      },
    });

    return NextResponse.json(table);
  } catch (error: any) {
    // P6: Handle duplicate slug with a clear 409 instead of generic 500
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "slug כבר קיים בחברה זו" },
        { status: 409 }
      );
    }
    console.error("Error creating table:", error);
    return NextResponse.json(
      { error: "Failed to create table" },
      { status: 500 }
    );
  }
}
