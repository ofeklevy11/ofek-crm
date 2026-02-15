import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";

const BATCH_SIZE = 5000;
const MAX_BATCHES = 50;

/**
 * Weekly cron job to clean up old log rows that grow unboundedly.
 *
 * Retention policy:
 *   - AuditLog:              90 days  (record mutation history)
 *   - TicketActivityLog:     90 days  (ticket field-change history)
 *   - AutomationLog:        180 days  (automation execution history)
 *   - ViewRefreshLog:         7 days  (rate-limit tracking)
 *   - AnalyticsRefreshLog:    7 days  (rate-limit tracking)
 *
 * Runs weekly alongside the existing automation-cleanup and notification-cleanup jobs.
 * Uses batched deletes to avoid long locks and stay within statement_timeout.
 */
export const cleanupOldLogData = inngest.createFunction(
  {
    id: "cleanup-old-log-data",
    name: "Cleanup Old Log Data",
    retries: 1,
    timeouts: { finish: "5m" },
    concurrency: { limit: 1 },
  },
  { cron: "0 4 * * 1" }, // Weekly on Monday at 4:00 AM (offset from Sunday automation cleanup)
  async ({ step }) => {
    const now = new Date();
    const ninetyDaysCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const sevenDaysCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // --- AuditLog cleanup (90 days) ---
    const auditLogsDeleted = await step.run("cleanup-audit-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.auditLog.findMany({
          where: { timestamp: { lt: ninetyDaysCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.auditLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    // --- TicketActivityLog cleanup (90 days) ---
    const ticketActivityDeleted = await step.run("cleanup-ticket-activity-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.ticketActivityLog.findMany({
          where: { createdAt: { lt: ninetyDaysCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.ticketActivityLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    // --- AutomationLog cleanup (180 days) ---
    const automationLogsDeleted = await step.run("cleanup-automation-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.automationLog.findMany({
          where: { executedAt: { lt: oneEightyDaysCutoff } },
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

    // --- ViewRefreshLog cleanup (7 days) ---
    const viewRefreshDeleted = await step.run("cleanup-view-refresh-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.viewRefreshLog.findMany({
          where: { timestamp: { lt: sevenDaysCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.viewRefreshLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    // --- AnalyticsRefreshLog cleanup (7 days) ---
    const analyticsRefreshDeleted = await step.run("cleanup-analytics-refresh-logs", async () => {
      let total = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const rows = await prisma.analyticsRefreshLog.findMany({
          where: { timestamp: { lt: sevenDaysCutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (rows.length === 0) break;

        const res = await prisma.analyticsRefreshLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        total += res.count;
        if (rows.length < BATCH_SIZE) break;
      }
      return total;
    });

    console.log(
      `[cleanup-log-data] Deleted ${auditLogsDeleted} audit logs (>90d), ` +
      `${ticketActivityDeleted} ticket activity logs (>90d), ` +
      `${automationLogsDeleted} automation logs (>180d), ` +
      `${viewRefreshDeleted} view refresh logs (>7d), ` +
      `${analyticsRefreshDeleted} analytics refresh logs (>7d)`,
    );

    return { auditLogsDeleted, ticketActivityDeleted, automationLogsDeleted, viewRefreshDeleted, analyticsRefreshDeleted };
  },
);
