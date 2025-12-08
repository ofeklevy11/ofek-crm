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
    const { title, clientId, amount, frequency, startDate, notes } = body;

    // Verify client belongs to user's company
    const client = await prisma.client.findFirst({
      where: { id: parseInt(clientId), companyId: user.companyId },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

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
