import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, clientId, amount, dueDate, notes } = body;

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
