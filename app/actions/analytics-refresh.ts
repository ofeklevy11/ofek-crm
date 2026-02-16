"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, ANALYTICS_RATE_LIMITS } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";

const log = createLogger("AnalyticsRefresh");

export async function getAnalyticsRefreshUsage() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, usage: 0 };
    }

    if (!hasUserFlag(user, "canViewAnalytics")) {
      return { success: false, usage: 0 };
    }

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.read);
    if (rl) return { success: false, usage: 0 };

    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

    const usageCount = await prisma.analyticsRefreshLog.count({
      where: {
        userId: user.id,
        timestamp: { gt: windowStart },
      },
    });

    // Find the oldest log in the window to calculate when the next credit returns
    let nextResetTime: string | null = null;
    if (usageCount > 0) {
      const oldestLog = await prisma.analyticsRefreshLog.findFirst({
        where: {
          userId: user.id,
          timestamp: { gt: windowStart },
        },
        orderBy: { timestamp: "asc" },
      });

      if (oldestLog) {
        nextResetTime = new Date(
          new Date(oldestLog.timestamp).getTime() + 4 * 60 * 60 * 1000,
        ).toISOString();
      }
    }

    // Probabilistic cleanup: only 5% of calls trigger delete to reduce DB write contention
    // Bounded: find up to 100 stale records then delete by IDs
    if (Math.random() < 0.05) {
      try {
        const cleanupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const staleRecords = await prisma.analyticsRefreshLog.findMany({
          where: { userId: user.id, timestamp: { lt: cleanupCutoff } },
          select: { id: true },
          take: 100,
        });
        if (staleRecords.length > 0) {
          await prisma.analyticsRefreshLog.deleteMany({
            where: { id: { in: staleRecords.map((r) => r.id) } },
          });
        }
      } catch (cleanupErr) {
        log.error("Error cleaning up old refresh logs", { error: String(cleanupErr) });
      }
    }

    return { success: true, usage: usageCount, nextResetTime };
  } catch (error) {
    log.error("Error getting analytics refresh usage", { error: String(error) });
    return { success: false, usage: 0 };
  }
}
