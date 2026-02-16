import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceSyncStatus");

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const job = await prisma.financeSyncJob.findFirst({
      where: { id: jobId, companyId: user.companyId },
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
    log.error("Finance sync status error", { error: String(err) });
    return NextResponse.json(
      { error: "Failed to fetch sync status" },
      { status: 500 },
    );
  }
}
