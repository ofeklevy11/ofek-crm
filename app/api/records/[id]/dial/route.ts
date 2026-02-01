import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/records/[id]/dial
 * Records when a user makes a direct dial call to a customer.
 * Updates the record with dialedById and dialedAt fields.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);

    if (isNaN(recordId)) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // CRITICAL: Filter by companyId to ensure multi-tenant isolation
    const existingRecord = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
    });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Update the record with dial information
    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        dialedById: currentUser.id,
        dialedAt: new Date(),
      },
      include: {
        dialedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Trigger DIRECT_DIAL automations synchronously to ensure we return updated data
    const { processDirectDialTrigger } =
      await import("@/app/actions/automations");

    await processDirectDialTrigger(
      existingRecord.tableId,
      recordId,
      currentUser.companyId,
    );

    // Fetch the latest record data potentially updated by automations
    const updatedRecord = await prisma.record.findUnique({
      where: { id: recordId },
      include: {
        dialedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      dialedBy: updatedRecord?.dialedBy,
      dialedAt: updatedRecord?.dialedAt,
      recordData: updatedRecord?.data,
    });
  } catch (error) {
    console.error("Error recording dial:", error);
    return NextResponse.json(
      { error: "Failed to record dial" },
      { status: 500 },
    );
  }
}
