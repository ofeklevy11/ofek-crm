import { NextResponse } from "next/server";
import { processTimeBasedAutomations } from "@/app/actions/automations";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    console.log("Starting Main Automation Job...");

    // BB8: Cursor-based pagination to handle >1000 companies
    const companies: { id: number }[] = [];
    let cursor: number | undefined;
    const PAGE_SIZE = 1000;

    do {
      const page = await prisma.company.findMany({
        select: { id: true },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      });
      companies.push(...page);
      cursor = page.length === PAGE_SIZE ? page[page.length - 1].id : undefined;
    } while (cursor);

    if (companies.length > 0) {
      // BB9: Add dedup IDs to prevent duplicates on cron retry
      const minuteBucket = Math.floor(Date.now() / 60000);
      const events: { id?: string; name: string; data: Record<string, unknown> }[] = companies.flatMap((company) => [
        { id: `time-based-${company.id}-${minuteBucket}`, name: "automation/time-based", data: { companyId: company.id } },
        { id: `event-based-${company.id}-${minuteBucket}`, name: "automation/event-based", data: { companyId: company.id } },
      ]);

      // BB17: Add SLA scan dedup ID
      events.push({
        id: `sla-scan-${minuteBucket}`,
        name: "sla/manual-scan",
        data: { triggeredAt: new Date().toISOString() },
      });

      try {
        await inngest.send(events);
      } catch (sendErr) {
        // Fallback: parallel processing with timeout (max 50s to stay under Vercel 60s limit)
        console.error("[Cron] Failed to send Inngest events, falling back to parallel:", sendErr);
        const { processEventAutomations } = await import("@/app/actions/event-automations");

        const FALLBACK_CONCURRENCY = 3;
        const FALLBACK_TIMEOUT_MS = 50_000;
        const deadline = Date.now() + FALLBACK_TIMEOUT_MS;

        for (let i = 0; i < companies.length; i += FALLBACK_CONCURRENCY) {
          if (Date.now() >= deadline) {
            console.warn(`[Cron] Fallback timeout reached after ${i} companies, stopping.`);
            break;
          }
          const batch = companies.slice(i, i + FALLBACK_CONCURRENCY);
          await Promise.allSettled(
            batch.map(async (company) => {
              await processTimeBasedAutomations(company.id);
              await processEventAutomations(company.id);
            }),
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Automations dispatched to background",
    });
  } catch (error) {
    console.error("Error in automation cron:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
