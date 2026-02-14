import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId
    const categories = await prisma.tableCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        tables: {
          select: { id: true }, // Just to count or check existence if needed
          where: { companyId: user.companyId }, // Double check on strict filtering
        },
      },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
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

    // Typically only admins/managers can create categories?
    // Let's assume standard users can create categories for now, but strictly isolated to company.

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const category = await prisma.tableCategory.create({
      data: {
        name,
        companyId: user.companyId, // CRITICAL: Attribute to company
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
