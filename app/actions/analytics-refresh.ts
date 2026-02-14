"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function checkAnalyticsRefreshEligibility() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const plan = user.isPremium || "basic";
    let maxRefreshes = 3;
    if (plan === "premium") {
      maxRefreshes = 10;
    } else if (plan === "super") {
      maxRefreshes = 9999;
    }

    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

    const usageCount = await prisma.analyticsRefreshLog.count({
      where: {
        userId: user.id,
        timestamp: { gt: windowStart },
      },
    });

    if (usageCount >= maxRefreshes) {
      return {
        success: false,
        error: `הגעת למגבלת הרענונים בחבילה שלך (${maxRefreshes}). שדרג ל-Premium כדי לקבל יותר.`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error checking analytics refresh eligibility:", error);
    return { success: false, error: "Failed to check eligibility" };
  }
}

export async function logAnalyticsRefresh() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.analyticsRefreshLog.create({
      data: {
        userId: user.id,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error logging analytics refresh:", error);
    return { success: false, error: "Failed to log refresh" };
  }
}

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

    // Cleanup old logs (older than 24 hours) to prevent unbounded growth
    // Scoped to current user to avoid cross-tenant side effects
    try {
      const cleanupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.analyticsRefreshLog.deleteMany({
        where: { userId: user.id, timestamp: { lt: cleanupCutoff } },
      });
    } catch (cleanupErr) {
      console.error("Error cleaning up old refresh logs:", cleanupErr);
    }

    return { success: true, usage: usageCount, nextResetTime };
  } catch (error) {
    console.error("Error getting analytics refresh usage:", error);
    return { success: false, usage: 0 };
  }
}
