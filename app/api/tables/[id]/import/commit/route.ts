import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canWriteTable } from "@/lib/permissions";
import { redis } from "@/lib/redis";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("ImportCommit");

/**
 * Commit Import Job Endpoint
 *
 * This endpoint uses Inngest for background job processing:
 * 1. Validates the request and job
 * 2. Sends an event to Inngest to process the import in the background
 * 3. Returns immediately with the job ID
 *
 * The client should poll the job status endpoint to track progress.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }

    // Rate Limiting
    const rateLimitKey = `import_limit:${user.id}`;
    const recentUploads = await redis.incr(rateLimitKey);
    if (recentUploads === 1) {
      await redis.expire(rateLimitKey, 60);
    }

    if (recentUploads > 5) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות ייבוא. אנא המתן דקה." },
        { status: 429 },
      );
    }

    const tableId = parseInt(id, 10);
    if (!Number.isFinite(tableId) || tableId < 1) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }
    if (!canWriteTable(user, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const { importJobId } = body;

    if (!importJobId) {
      return NextResponse.json(
        { error: "Missing importJobId" },
        { status: 400 },
      );
    }

    // 1. Get Job and validate access — companyId in query
    const job = await prisma.importJob.findFirst({
      where: { id: importJobId, tableId, companyId: user.companyId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 },
      );
    }

    if (job.status === "IMPORTED") {
      return NextResponse.json(
        { error: "Job already imported" },
        { status: 400 },
      );
    }

    if (job.status === "IMPORTING") {
      return NextResponse.json(
        { error: "Job is already being processed" },
        { status: 400 },
      );
    }

    // Verify table exists and belongs to user's company
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
    });

    if (!table) {
      return NextResponse.json({ error: "הטבלה לא נמצאה" }, { status: 404 });
    }

    // 2. Update status to QUEUED
    await prisma.importJob.update({
      where: { id: job.id, companyId: user.companyId },
      data: {
        status: "IMPORTING",
        summary: {
          ...(job.summary as any),
          queuedAt: new Date().toISOString(),
        },
      },
    });

    // 3. Send event to Inngest for background processing
    await inngest.send({
      id: `import-${job.id}`,
      name: "import/job.started",
      data: {
        importJobId: job.id,
        tableId: tableId,
        userId: user.id,
        companyId: user.companyId,
        fileKey: job.fileKey,
      },
    });

    // 4. Return immediately
    return NextResponse.json({
      success: true,
      status: "queued",
      message: "הייבוא נוסף לתור. ניתן לעקוב אחר ההתקדמות.",
      importJobId: job.id,
    });
  } catch (err: any) {
    log.error("Import commit error", { error: String(err) });
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}
