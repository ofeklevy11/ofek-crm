"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getAnalyticsRefreshUsage() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, usage: 0 };
    }

    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

    const usageCount = await prisma.analyticsRefreshLog.count({
      where: {
        userId: user.id,
        timestamp: { gt: windowStart },
      },
    });

    // Find the oldest log in the window to calculate when the next credit returns
    let nextResetTime = null;
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
    if (Math.random() < 0.05) {
      try {
        const cleanupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await prisma.analyticsRefreshLog.deleteMany({
          where: { userId: user.id, timestamp: { lt: cleanupCutoff } },
        });
      } catch (cleanupErr) {
        console.error("Error cleaning up old refresh logs:", cleanupErr);
      }
    }

    return { success: true, usage: usageCount, nextResetTime };
  } catch (error) {
    console.error("Error getting analytics refresh usage:", error);
    return { success: false, usage: 0 };
  }
}
