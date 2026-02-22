import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { processTimeBasedAutomations } from "@/app/actions/automations-core";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("AutomationsCron");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;

    const expected = `Bearer ${secret}`;
    if (!secret || !authHeader || authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    log.info("Starting main automation job");

    // BB9: Add dedup IDs to prevent duplicates on cron retry
    const minuteBucket = Math.floor(Date.now() / 60000);
    const events: { id?: string; name: string; data: Record<string, unknown> }[] = [];

    // Dispatch meeting reminders to Inngest (same pattern as time-based/event-based)
    events.push({
      id: `meeting-reminders-${minuteBucket}`,
      name: "automation/meeting-reminders",
      data: { triggeredAt: new Date().toISOString() },
    });

    // Only fetch companies that have active time-based or event-based automation rules.
    // This avoids dispatching Inngest events for companies with no automations at all.
    const companies = await prisma.$queryRaw<{ id: number }[]>`
      SELECT DISTINCT c.id
      FROM "Company" c
      WHERE EXISTS (
        SELECT 1 FROM "AutomationRule" ar
        WHERE ar."companyId" = c.id
          AND ar."isActive" = true
          AND ar."triggerType" IN ('TIME_SINCE_CREATION', 'EVENT_TIME')
      )
      ORDER BY c.id
    `;

    for (const company of companies) {
      events.push(
        { id: `time-based-${company.id}-${minuteBucket}`, name: "automation/time-based", data: { companyId: company.id } },
        { id: `event-based-${company.id}-${minuteBucket}`, name: "automation/event-based", data: { companyId: company.id } },
      );
    }

    // BB17: Add SLA scan dedup ID
    if (companies.length > 0) {
      events.push({
        id: `sla-scan-${minuteBucket}`,
        name: "sla/manual-scan",
        data: { triggeredAt: new Date().toISOString() },
      });
    }

    // Send all events (meeting reminders + per-company time/event-based + SLA)
    if (events.length > 0) {
      try {
        const INNGEST_BATCH_SIZE = 500;
        for (let i = 0; i < events.length; i += INNGEST_BATCH_SIZE) {
          await inngest.send(events.slice(i, i + INNGEST_BATCH_SIZE));
        }
      } catch (sendErr) {
        // Fallback: parallel processing with timeout (max 50s to stay under Vercel 60s limit)
        log.error("Failed to send Inngest events, falling back to parallel", { error: String(sendErr) });

        // Fallback for meeting reminders
        try {
          const { processMeetingReminders } = await import("@/app/actions/meeting-automations");
          await processMeetingReminders();
        } catch (err) {
          log.error("Meeting reminders fallback failed", { error: String(err) });
        }

        if (companies.length > 0) {
          const { processEventAutomations } = await import("@/app/actions/event-automations-core");
          const FALLBACK_CONCURRENCY = 3;
          const FALLBACK_TIMEOUT_MS = 50_000;
          const deadline = Date.now() + FALLBACK_TIMEOUT_MS;

          for (let i = 0; i < companies.length; i += FALLBACK_CONCURRENCY) {
            if (Date.now() >= deadline) {
              log.warn("Fallback timeout reached, stopping", { companiesProcessed: i });
              break;
            }
            const batch = companies.slice(i, i + FALLBACK_CONCURRENCY);
            await Promise.allSettled(
              batch.map(async (company) => {
                await processTimeBasedAutomations(company.id);
                await processEventAutomations(company.id, secret);
              }),
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Automations dispatched to background",
    });
  } catch (error) {
    log.error("Error in automation cron", { error: String(error) });
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
