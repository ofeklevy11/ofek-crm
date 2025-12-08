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
    const paymentId = parseInt(id);

    // CRITICAL: Filter by client.companyId
    const payment = await prisma.oneTimePayment.findFirst({
      where: {
        id: paymentId,
        client: {
          companyId: user.companyId,
        },
      },
      include: { client: true },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Error fetching payment:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment" },
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
    const paymentId = parseInt(id);
    const data = await request.json();

    // Verify ownership via client
    const existingPayment = await prisma.oneTimePayment.findFirst({
      where: {
        id: paymentId,
        client: {
          companyId: user.companyId,
        },
      },
    });

    if (!existingPayment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Validate status if provided
    if (
      data.status &&
      !["pending", "paid", "overdue", "cancelled"].includes(data.status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // If marking as paid, we might want to create a transaction record automatically
    // But for now, let's just update the payment record
    const updatedPayment = await prisma.oneTimePayment.update({
      where: { id: paymentId },
      data: {
        title: data.title,
        amount: data.amount ? parseFloat(data.amount) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        status: data.status,
        paidDate: data.paidDate
          ? new Date(data.paidDate)
          : data.status === "paid"
          ? new Date()
          : undefined,
        notes: data.notes,
      },
    });

    return NextResponse.json(updatedPayment);
  } catch (error) {
    console.error("Error updating payment:", error);
    return NextResponse.json(
      { error: "Failed to update payment" },
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
    const paymentId = parseInt(id);

    // Verify ownership via client
    const existingPayment = await prisma.oneTimePayment.findFirst({
      where: {
        id: paymentId,
        client: {
          companyId: user.companyId,
        },
      },
    });

    if (!existingPayment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    await prisma.oneTimePayment.delete({
      where: { id: paymentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting payment:", error);
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}
