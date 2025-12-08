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

    const table = await prisma.tableMeta.create({
      data: {
        name,
        slug,
        schemaJson: schemaJson || {},
        companyId: user.companyId,
        createdBy: user.id,
        categoryId: body.categoryId ? Number(body.categoryId) : undefined,
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
