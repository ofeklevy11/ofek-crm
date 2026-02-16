import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";

/**
 * Background job for broadcasting notifications via Redis Pub/Sub.
 * Batches multiple notifications together to reduce Redis round-trips.
 * Replaces inline Redis publish calls in notifications.ts.
 */
export const broadcastNotifications = inngest.createFunction(
  {
    id: "broadcast-notifications",
    name: "Broadcast Notifications via Redis",
    retries: 2,
    timeouts: { finish: "30s" },
    batchEvents: {
      maxSize: 5,
      timeout: "1s",
    },
    concurrency: [
      { limit: 3, key: "event.data.userId" },
      { limit: 5 }, // global cap
    ],
  },
  { event: "notification/broadcast" },
  async ({ events }) => {
    const { redisPublisher } = await import("@/lib/redis");

    // Use pipeline to batch all publishes into a single Redis round-trip
    const pipeline = redisPublisher.pipeline();

    // Batch-validate that each userId belongs to the claimed companyId
    const userIds = [...new Set(events.map((e) => e.data.userId).filter(Boolean))];
    const validUsers = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds as number[] } },
          select: { id: true, companyId: true },
        })
      : [];
    const userCompanyMap = new Map(validUsers.map((u) => [u.id, u.companyId]));

    for (const { data } of events) {
      if (!data.companyId) {
        console.error(`[broadcast-notifications] Missing companyId for userId=${data.userId}, skipping`);
        continue;
      }
      // SECURITY: Verify userId actually belongs to the claimed companyId
      const actualCompanyId = userCompanyMap.get(data.userId);
      if (actualCompanyId !== data.companyId) {
        console.error(`[broadcast-notifications] userId=${data.userId} does not belong to companyId=${data.companyId}, skipping`);
        continue;
      }
      const channel = `company:${data.companyId}:user:${data.userId}:notifications`;
      pipeline.publish(channel, JSON.stringify(data.notification));
    }

    const results = await pipeline.exec();
    const failed = results?.filter(([err]) => err !== null).length ?? 0;

    if (failed > 0) {
      // BB20: Log failed notification details for debugging
      const failedDetails = results
        ?.map(([err], idx) => err ? `userId=${events[idx]?.data?.userId}: ${err}` : null)
        .filter(Boolean)
        .slice(0, 10); // cap to avoid log explosion
      console.error(
        `[broadcast-notifications] ${failed}/${events.length} publishes failed:`,
        failedDetails,
      );
    }

    return { broadcasted: events.length, failed };
  },
);

/**
 * Daily cron job to clean up old notifications.
 * Deletes read notifications older than 90 days and unread older than 180 days.
 * Processes in batches per company to avoid long-running transactions.
 */
export const cleanupOldNotifications = inngest.createFunction(
  {
    id: "cleanup-old-notifications",
    name: "Cleanup Old Notifications",
    retries: 1,
    timeouts: { finish: "5m" },
    concurrency: { limit: 1 },
  },
  { cron: "0 3 * * *" }, // Daily at 3:00 AM
  async ({ step }) => {
    const BATCH_SIZE = 5000;
    const MAX_BATCHES = 50; // per-company safety guard
    const now = new Date();
    const readCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const unreadCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Find all companies that have old notifications to clean up
    const companies = await step.run("find-companies", async () => {
      const readCompanies = await prisma.notification.findMany({
        where: { read: true, createdAt: { lt: readCutoff } },
        select: { companyId: true },
        distinct: ["companyId"],
      });
      const unreadCompanies = await prisma.notification.findMany({
        where: { read: false, createdAt: { lt: unreadCutoff } },
        select: { companyId: true },
        distinct: ["companyId"],
      });
      const ids = new Set([
        ...readCompanies.map((c) => c.companyId),
        ...unreadCompanies.map((c) => c.companyId),
      ]);
      return Array.from(ids);
    });

    let totalDeletedRead = 0;
    let totalDeletedUnread = 0;

    for (const companyId of companies) {
      const result = await step.run(`cleanup-company-${companyId}`, async () => {
        let deletedRead = 0;
        let deletedUnread = 0;

        // Delete old read notifications for this company
        let readBatch = 0;
        let readCount: number;
        do {
          const rows = await prisma.notification.findMany({
            where: { companyId, read: true, createdAt: { lt: readCutoff } },
            select: { id: true },
            take: BATCH_SIZE,
          });
          if (rows.length === 0) break;
          const res = await prisma.notification.deleteMany({
            where: { id: { in: rows.map((r) => r.id) }, companyId },
          });
          readCount = res.count;
          deletedRead += readCount;
          readBatch++;
        } while (readCount! >= BATCH_SIZE && readBatch < MAX_BATCHES);

        // Delete old unread notifications for this company
        let unreadBatch = 0;
        let unreadCount: number;
        do {
          const rows = await prisma.notification.findMany({
            where: { companyId, read: false, createdAt: { lt: unreadCutoff } },
            select: { id: true },
            take: BATCH_SIZE,
          });
          if (rows.length === 0) break;
          const res = await prisma.notification.deleteMany({
            where: { id: { in: rows.map((r) => r.id) }, companyId },
          });
          unreadCount = res.count;
          deletedUnread += unreadCount;
          unreadBatch++;
        } while (unreadCount! >= BATCH_SIZE && unreadBatch < MAX_BATCHES);

        return { deletedRead, deletedUnread };
      });

      totalDeletedRead += result.deletedRead;
      totalDeletedUnread += result.deletedUnread;
    }

    console.log(
      `[cleanup-notifications] Deleted ${totalDeletedRead} read (>90d) + ${totalDeletedUnread} unread (>180d) across ${companies.length} companies`,
    );

    return { deletedRead: totalDeletedRead, deletedUnread: totalDeletedUnread, companiesProcessed: companies.length };
  },
);
