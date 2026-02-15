import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";

const BATCH_SIZE = 5000;
const MAX_BATCHES = 50;

/**
 * Weekly cron job to clean up old automation-related rows.
 *
 * Retention policy:
 *   - AutomationLog:       90 days  (dedup records — safe to drop after TTL)
 *   - StatusDuration:      365 days (analytics metric — longer retention)
 *   - MultiEventDuration:  365 days (analytics metric — longer retention)
 *
 * Processes in batches per company to avoid long-running transactions
 * and to stay within the statement_timeout configured on the pool.
 */
export const cleanupOldAutomationData = inngest.createFunction(
  {
    id: "cleanup-old-automation-data",
    name: "Cleanup Old Automation Data",
    retries: 1,
    timeouts: { finish: "5m" },
    concurrency: { limit: 1 },
  },
  { cron: "0 4 * * 0" }, // Weekly on Sunday at 4:00 AM
  async ({ step }) => {
    const now = new Date();
    const logCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const durationCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // --- AutomationLog cleanup (90 days) ---
    const logsDeleted = await step.run("cleanup-automation-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.automationLog.findMany({
          where: { executedAt: { lt: logCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.automationLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    // --- StatusDuration cleanup (365 days) ---
    const statusDurationsDeleted = await step.run("cleanup-status-durations", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.statusDuration.findMany({
          where: { createdAt: { lt: durationCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.statusDuration.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    // --- MultiEventDuration cleanup (365 days) ---
    const multiEventDeleted = await step.run("cleanup-multi-event-durations", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.multiEventDuration.findMany({
          where: { createdAt: { lt: durationCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.multiEventDuration.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    console.log(
      `[cleanup-automation-data] Deleted ${logsDeleted} automation logs (>90d), ` +
      `${statusDurationsDeleted} status durations (>365d), ` +
      `${multiEventDeleted} multi-event durations (>365d)`,
    );

    return { logsDeleted, statusDurationsDeleted, multiEventDeleted };
  },
);
