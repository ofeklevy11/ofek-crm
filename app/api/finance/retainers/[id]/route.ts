import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

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
    const retainerId = parseInt(id);

    // CRITICAL: Filter by client.companyId
    const retainer = await prisma.retainer.findFirst({
      where: {
        id: retainerId,
        client: {
          companyId: user.companyId,
        },
      },
      include: { client: true },
    });

    if (!retainer) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(retainer);
  } catch (error) {
    console.error("Error fetching retainer:", error);
    return NextResponse.json(
      { error: "Failed to fetch retainer" },
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
    const retainerId = parseInt(id);
    const data = await request.json();

    // Verify ownership via client
    const existingRetainer = await prisma.retainer.findFirst({
      where: {
        id: retainerId,
        client: {
          companyId: user.companyId,
        },
      },
    });

    if (!existingRetainer) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    // Validate status if provided
    if (
      data.status &&
      !["active", "paused", "cancelled"].includes(data.status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedRetainer = await prisma.retainer.update({
      where: { id: retainerId },
      data: {
        title: data.title,
        amount: data.amount ? parseFloat(data.amount) : undefined,
        frequency: data.frequency,
        status: data.status,
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : undefined,
        notes: data.notes,
      },
    });

    return NextResponse.json(updatedRetainer);
  } catch (error) {
    console.error("Error updating retainer:", error);
    return NextResponse.json(
      { error: "Failed to update retainer" },
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
    const retainerId = parseInt(id);

    // Verify ownership via client
    const existingRetainer = await prisma.retainer.findFirst({
      where: {
        id: retainerId,
        client: {
          companyId: user.companyId,
        },
      },
    });

    if (!existingRetainer) {
      return NextResponse.json(
        { error: "Retainer not found" },
        { status: 404 }
      );
    }

    await prisma.retainer.delete({
      where: { id: retainerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting retainer:", error);
    return NextResponse.json(
      { error: "Failed to delete retainer" },
      { status: 500 }
    );
  }
}
