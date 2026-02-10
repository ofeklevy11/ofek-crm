import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

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
  // Security: Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON] SLA check triggered at", new Date().toISOString());

  try {
    await inngest.send({
      name: "sla/manual-scan",
      data: { triggeredAt: new Date().toISOString() },
    });

    return NextResponse.json({
      success: true,
      message: "SLA scan dispatched to background",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Failed to dispatch SLA scan:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
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
