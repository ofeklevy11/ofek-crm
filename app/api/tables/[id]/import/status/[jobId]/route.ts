import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

/**
 * Get Import Job Status
 *
 * Returns the current status and progress of an import job.
 * The client can poll this endpoint to track import progress.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const { id, jobId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }

    const tableId = parseInt(id);

    // Get job with access control — companyId in query for defense-in-depth
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, tableId, companyId: user.companyId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 },
      );
    }

    const summary = job.summary as any;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: summary?.progress || 0,
      insertedCount: summary?.insertedCount || 0,
      totalRows: summary?.totalRows || 0,
      validRows: summary?.validRows || 0,
      invalidRows: summary?.invalidRows || 0,
      errors: summary?.errors || [],
      error: summary?.error || null,
      completedAt: summary?.completedAt || null,
      queuedAt: summary?.queuedAt || null,
    });
  } catch (err: any) {
    console.error("Import status error:", err);
    return NextResponse.json(
      { error: err.message || "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}
