import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, clientId, amount, dueDate, notes } = body;

    // H1: Input validation
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    // H3: Wrap client verify + create in transaction to prevent TOCTOU race
    const payment = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: parseInt(clientId), companyId: user.companyId, deletedAt: null },
      });
      if (!client) {
        throw new Error("Client not found");
      }

      return tx.oneTimePayment.create({
        data: {
          title,
          clientId: parseInt(clientId),
          companyId: user.companyId,
          amount,
          dueDate: new Date(dueDate),
          status: "pending",
          notes,
        },
      });
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Error creating payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
