import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const tables = await prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json(tables);
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

    const body = await request.json();
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
  } catch (error) {
    console.error("Error creating table:", error);
    return NextResponse.json(
      { error: "Failed to create table" },
      { status: 500 }
    );
  }
}
