import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { timingSafeEqual } from "crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("SlaCron");

/**
 * API Route to trigger SLA breach check.
 *
 * With Inngest cron, the sla-scan function runs automatically every minute.
 * This endpoint remains as a manual trigger / fallback for:
 * 1. Manual: GET /api/cron/check-sla
 * 2. External cron service (e.g., cron-job.org, Vercel Cron)
 *
 * It sends an Inngest event which triggers the same sla-scan logic,
 * so the heavy work happens in the background (not inline in this HTTP request).
 */
export async function GET(request: Request) {
  // Security: Verify CRON_SECRET (timing-safe comparison)
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const expected = `Bearer ${secret}`;
  if (!secret || !authHeader || authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("SLA check triggered");

  try {
    await inngest.send({
      id: `sla-manual-scan-${Math.floor(Date.now() / 60000)}`,
      name: "sla/manual-scan",
      data: { triggeredAt: new Date().toISOString() },
    });

    return NextResponse.json({
      success: true,
      message: "SLA scan dispatched to background",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("Failed to dispatch SLA scan", { error: String(error) });
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// Also support POST for flexibility
export async function POST(request: Request) {
  return GET(request);
}
