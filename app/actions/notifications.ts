"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";

export async function getNotifications(
  limit: number | null = 20,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Force usage of current user ID for security
    const targetUserId = user.id;

    const notifications = await withRetry(() => prisma.notification.findMany({
      where: {
        userId: targetUserId,
        companyId: user.companyId, // Extra safety
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit ? Math.min(limit, 200) : 200,
    }));
    return { success: true, data: notifications };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { success: false, error: "Failed to fetch notifications" };
  }
}

export async function markAsRead(notificationId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: user.id,
        companyId: user.companyId,
      },
      data: {
        read: true,
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        error: "Notification not found or unauthorized",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: "Failed to mark as read" };
  }
}

/**
 * Create a notification for a user within the caller's company.
 * Requires an active user session — use `createNotificationForCompany()` for
 * background jobs (Inngest, cron) that have no session context.
 */
export async function createNotification(data: {
  userId: number;
  title: string;
  message?: string;
  link?: string;
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify target user belongs to the same company
    if (data.userId !== currentUser.id) {
      const targetUser = await prisma.user.findFirst({
        where: { id: data.userId, companyId: currentUser.companyId },
        select: { id: true },
      });
      if (!targetUser) {
        return { success: false, error: "Target user not in your company" };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        companyId: currentUser.companyId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
      },
    });

    // --- REALTIME UPDATE (background via Inngest, batched) ---
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `notify-broadcast-${data.userId}-${notification.id}`,
        name: "notification/broadcast",
        data: { userId: data.userId, companyId: currentUser.companyId, notification },
      });
    } catch (err) {
      console.error("[createNotification] Inngest broadcast failed, notification saved but SSE skipped:", err);
    }
    // -----------------------

    return { success: true, data: notification };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: "Failed to create notification" };
  }
}


/**
 * Create notification for a specific company (for use in automations/cron jobs without session)
 */
export async function createNotificationForCompany(data: {
  companyId: number;
  userId: number;
  title: string;
  message?: string;
  link?: string;
  skipValidation?: boolean;
}) {
  try {
    if (!data.skipValidation) {
      // Verify that target userId belongs to the company
      const targetUser = await prisma.user.findFirst({
        where: { id: data.userId, companyId: data.companyId },
        select: { id: true },
      });

      if (!targetUser) {
        console.warn(
          `[createNotificationForCompany] Target user ${data.userId} not found in company ${data.companyId}`,
        );
        return { success: false, error: "User not in company" };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
      },
    });

    // --- REALTIME UPDATE (background via Inngest, batched) ---
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `notify-broadcast-${data.userId}-${notification.id}`,
        name: "notification/broadcast",
        data: { userId: data.userId, companyId: data.companyId, notification },
      });
    } catch (err) {
      console.error("[createNotificationForCompany] Inngest broadcast failed, notification saved but SSE skipped:", err);
    }
    // -----------------------

    console.log(
      `[Notification] Created notification #${notification.id} for user ${data.userId} (Company ${data.companyId})`,
    );
    return { success: true, data: notification };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: "Failed to create notification" };
  }
}

export async function markAllAsRead() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        companyId: user.companyId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return { success: false, error: "Failed to mark all as read" };
  }
}

export async function deleteNotification(notificationId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const result = await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: user.id,
        companyId: user.companyId,
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        error: "Notification not found or unauthorized",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting notification:", error);
    return { success: false, error: "Failed to delete notification" };
  }
}

export async function deleteNotifications(notificationIds: number[]) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // P139: Validate array size to prevent oversized IN clause
    if (notificationIds.length > 1000) {
      return { success: false, error: "Too many notifications to delete at once" };
    }

    // Verify ownership for all notifications implicitly by including userId in the deleteMany query
    const result = await prisma.notification.deleteMany({
      where: {
        id: {
          in: notificationIds,
        },
        userId: user.id,
        companyId: user.companyId,
      },
    });

    return { success: true, count: result.count };
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return { success: false, error: "Failed to delete notifications" };
  }
}
