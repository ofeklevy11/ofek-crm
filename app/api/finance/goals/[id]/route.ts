import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const goalId = parseInt(id);

    const goal = await prisma.goal.findUnique({
      where: { id: goalId, companyId: user.companyId },
    });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Failed to fetch goal:", error);
    return NextResponse.json(
      { error: "Failed to fetch goal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const goalId = parseInt(id);
    const body = await request.json();

    const goal = await prisma.goal.update({
      where: { id: goalId, companyId: user.companyId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.metricType && { metricType: body.metricType }),
        ...(body.targetValue !== undefined && {
          targetValue: new Decimal(body.targetValue),
        }),
        ...(body.targetType && { targetType: body.targetType }),
        ...(body.filters && { filters: body.filters }),
        ...(body.periodType && { periodType: body.periodType }),
        ...(body.startDate && { startDate: new Date(body.startDate) }),
        ...(body.endDate && { endDate: new Date(body.endDate) }),
        ...(body.tableId !== undefined && { tableId: body.tableId }),
        ...(body.productId !== undefined && { productId: body.productId }),
        ...(body.warningThreshold !== undefined && {
          warningThreshold: body.warningThreshold,
        }),
        ...(body.criticalThreshold !== undefined && {
          criticalThreshold: body.criticalThreshold,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Failed to update goal:", error);
    return NextResponse.json(
      { error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const goalId = parseInt(id);

    await prisma.goal.delete({
      where: { id: goalId, companyId: user.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete goal:", error);
    return NextResponse.json(
      { error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}
