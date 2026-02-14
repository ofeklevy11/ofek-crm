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
    const clientId = parseInt(id);

    // CRITICAL: Filter by companyId
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId: user.companyId },
      include: {
        retainers: true,
        oneTimePayments: true,
        transactions: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    return NextResponse.json(
      { error: "Failed to fetch client" },
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
    const clientId = parseInt(id);
    const data = await request.json();

    // CRITICAL: Verify client belongs to user's company
    const existingClient = await prisma.client.findFirst({
      where: { id: clientId, companyId: user.companyId },
    });

    if (!existingClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId, companyId: user.companyId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        notes: data.notes,
      },
    });

    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error("Error updating client:", error);
    return NextResponse.json(
      { error: "Failed to update client" },
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
    const clientId = parseInt(id);

    // CRITICAL: Verify client belongs to user's company
    const existingClient = await prisma.client.findFirst({
      where: { id: clientId, companyId: user.companyId },
    });

    if (!existingClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Delete all related records first (cascade delete)
    // Defense-in-depth: scope every DELETE to companyId
    const companyId = existingClient.companyId;
    await prisma.$transaction([
      prisma.transaction.deleteMany({
        where: { clientId, client: { companyId } },
      }),
      prisma.retainer.deleteMany({
        where: { clientId, client: { companyId } },
      }),
      prisma.oneTimePayment.deleteMany({
        where: { clientId, client: { companyId } },
      }),
      prisma.financeRecord.deleteMany({
        where: { clientId, companyId },
      }),
      prisma.client.deleteMany({
        where: { id: clientId, companyId },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
