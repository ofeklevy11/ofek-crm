import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
    const recordId = parseId(id);

    if (!recordId) {
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

    // SECURITY: Atomic companyId check in update WHERE clause
    const record = await prisma.record.update({
      where: { id: recordId, companyId: currentUser.companyId },
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

    // Trigger DIRECT_DIAL automations asynchronously via Inngest, with direct fallback
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `direct-dial-${currentUser.companyId}-${recordId}-${Math.floor(Date.now() / 1000)}`,
        name: "automation/direct-dial",
        data: {
          tableId: existingRecord.tableId,
          recordId,
          companyId: currentUser.companyId,
          previousDialedAt: existingRecord.dialedAt?.toISOString() || null,
        },
      });
    } catch (autoError) {
      console.error("[Dial] Inngest send failed, falling back to direct automation execution:", autoError);
      try {
        const { processDirectDialTrigger } = await import("@/app/actions/automations");
        await processDirectDialTrigger(
          existingRecord.tableId,
          recordId,
          currentUser.companyId,
          existingRecord.dialedAt?.toISOString() || null,
        );
      } catch (directErr) {
        console.error("[Dial] Direct automation execution also failed:", directErr);
      }
    }

    return NextResponse.json({
      success: true,
      dialedBy: record.dialedBy,
      dialedAt: record.dialedAt,
      recordData: record.data,
    });
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "dial record");
  }
}
