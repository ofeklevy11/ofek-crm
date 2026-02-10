import { NextResponse } from "next/server";
import { processTimeBasedAutomations } from "@/app/actions/automations";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic"; // static by default, unless reading the request

export async function GET(request: Request) {
  try {
    // Optional: Add authorization check if needed (e.g. secret header)
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;

    // If CRON_SECRET is set, we verify it. If not, we allow it (development mode)
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    console.log("Starting Main Automation Job...");

    // Run time based automations
    await processTimeBasedAutomations();

    // Run event based automations
    const { processEventAutomations } =
      await import("@/app/actions/event-automations");
    await processEventAutomations();

    // Run SLA breach check automations (dispatched to Inngest background)
    await inngest.send({
      name: "sla/manual-scan",
      data: { triggeredAt: new Date().toISOString() },
    });

    return NextResponse.json({
      success: true,
      message: "Automations processed",
    });
  } catch (error) {
    console.error("Error in automation cron:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
