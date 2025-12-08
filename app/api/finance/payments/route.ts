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

    // Verify client belongs to user's company
    const client = await prisma.client.findFirst({
      where: { id: parseInt(clientId), companyId: user.companyId },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const payment = await prisma.oneTimePayment.create({
      data: {
        title,
        clientId: parseInt(clientId),
        amount,
        dueDate: new Date(dueDate),
        status: "pending",
        notes,
      },
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
