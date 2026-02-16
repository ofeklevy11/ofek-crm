"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";

const log = createLogger("Notifications");

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
      select: {
        id: true, userId: true, title: true, message: true,
        link: true, read: true, createdAt: true,
      },
    }));
    return { success: true, data: notifications };
  } catch (error) {
    log.error("Error fetching notifications", { error: String(error) });
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
    log.error("Error marking notification as read", { error: String(error) });
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
      select: {
        id: true, userId: true, title: true, message: true,
        link: true, read: true, createdAt: true,
      },
    });

    // Serialize BigInt id to Number for JSON compatibility (Inngest, SSE, etc.)
    const safeNotification = {
      ...notification,
      id: Number(notification.id),
    };

    // --- REALTIME UPDATE (background via Inngest, batched) ---
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        id: `notify-broadcast-${data.userId}-${safeNotification.id}`,
        name: "notification/broadcast",
        data: { userId: data.userId, companyId: currentUser.companyId, notification: safeNotification },
      });
    } catch (err) {
      log.error("Inngest broadcast failed, notification saved but SSE skipped", { error: String(err) });
    }
    // -----------------------

    return { success: true, data: safeNotification };
  } catch (error) {
    log.error("Error creating notification", { error: String(error) });
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
    log.error("Error marking all notifications as read", { error: String(error) });
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
    log.error("Error deleting notification", { error: String(error) });
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
    log.error("Error deleting notifications", { error: String(error) });
    return { success: false, error: "Failed to delete notifications" };
  }
}
