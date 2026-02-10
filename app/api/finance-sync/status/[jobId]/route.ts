import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

/**
 * Get Finance Sync Job Status
 *
 * Returns the current status and summary of a finance sync job.
 * The client polls this endpoint to track sync progress.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }

    const job = await prisma.financeSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.companyId !== user.companyId) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 },
      );
    }

    const summary = job.summary as any;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      scanned: summary?.scanned || 0,
      created: summary?.created || 0,
      updated: summary?.updated || 0,
      skippedExists: summary?.skippedExists || 0,
      skippedError: summary?.skippedError || 0,
      errors: summary?.errors || [],
      error: summary?.error || null,
      completedAt: summary?.completedAt || null,
    });
  } catch (err: any) {
    console.error("Finance sync status error:", err);
    return NextResponse.json(
      { error: err.message || "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}
