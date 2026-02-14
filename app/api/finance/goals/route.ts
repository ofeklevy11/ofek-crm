import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await prisma.goal.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ isActive: "desc" }, { endDate: "asc" }],
      take: 200,
    });

    return NextResponse.json(goals);
  } catch (error) {
    console.error("Failed to fetch goals:", error);
    return NextResponse.json(
      { error: "Failed to fetch goals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // SECURITY: Validate tableId and productId belong to user's company
    if (body.tableId) {
      const table = await prisma.tableMeta.findFirst({
        where: { id: body.tableId, companyId: user.companyId },
        select: { id: true },
      });
      if (!table) {
        return NextResponse.json({ error: "Invalid tableId" }, { status: 400 });
      }
    }
    if (body.productId) {
      const product = await prisma.product.findFirst({
        where: { id: body.productId, companyId: user.companyId },
        select: { id: true },
      });
      if (!product) {
        return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
      }
    }

    const goal = await prisma.goal.create({
      data: {
        companyId: user.companyId,
        name: body.name,
        metricType: body.metricType,
        targetValue: new Decimal(body.targetValue),
        targetType: body.targetType || "SUM",
        periodType: body.periodType || "MONTHLY",
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        filters: body.filters || {},
        tableId: body.tableId ?? null,
        productId: body.productId ?? null,
        warningThreshold: body.warningThreshold ?? 70,
        criticalThreshold: body.criticalThreshold ?? 50,
        notes: body.notes ?? null,
      },
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
