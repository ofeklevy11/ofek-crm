import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("ImportStatus");

/**
 * Get Import Job Status
 *
 * Returns the current status and progress of an import job.
 * The client can poll this endpoint to track import progress.
 */
async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const { id, jobId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    const tableId = parseInt(id, 10);
    if (!Number.isFinite(tableId) || tableId < 1) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

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
    log.error("Import status error", { error: String(err) });
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics("/api/tables/[id]/import/status/[jobId]", handleGET);
