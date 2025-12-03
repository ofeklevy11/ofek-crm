import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, clientId, amount, frequency, startDate, notes } = body;

    // Calculate next due date based on frequency
    const start = new Date(startDate);
    const nextDueDate = new Date(start);

    switch (frequency) {
      case "monthly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        break;
      case "quarterly":
        nextDueDate.setMonth(nextDueDate.getMonth() + 3);
        break;
      case "annually":
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        break;
    }

    const retainer = await prisma.retainer.create({
      data: {
        title,
        clientId: parseInt(clientId),
        amount,
        frequency,
        startDate: start,
        nextDueDate,
        status: "active",
        notes,
      },
    });

    return NextResponse.json(retainer, { status: 201 });
  } catch (error) {
    console.error("Error creating retainer:", error);
    return NextResponse.json(
      { error: "Failed to create retainer" },
      { status: 500 }
    );
  }
}
