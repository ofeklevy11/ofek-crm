import { NextResponse } from "next/server";
import { checkSlaBreaches } from "@/app/actions/sla-check";

/**
 * API Route to check SLA breaches
 *
 * Can be called:
 * 1. Manually: GET /api/cron/check-sla
 * 2. Via external cron service (e.g., cron-job.org, Vercel Cron)
 * 3. Via internal scheduler
 *
 * Optional: Add a secret key for security in production
 * e.g., ?key=YOUR_SECRET_KEY
 */
export async function GET(request: Request) {
  // Optional: Security check for production
  // Security: Verify CRON_SECRET check from Vercel
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON] SLA check triggered at", new Date().toISOString());

  try {
    const result = await checkSlaBreaches();

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] SLA check failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: Request) {
  return GET(request);
}
