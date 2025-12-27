"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getNotifications(
  userId?: number, // Deprecated argument, we use session user now
  limit: number | null = 20
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Force usage of current user ID for security
    const targetUserId = user.id;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: targetUserId,
        companyId: user.companyId, // Extra safety
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit ? limit : undefined,
    });
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

    // Verify ownership
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: user.id,
      },
    });

    if (!notification) {
      return {
        success: false,
        error: "Notification not found or unauthorized",
      };
    }

    await prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        read: true,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: "Failed to mark as read" };
  }
}

export async function createNotification(data: {
  userId: number;
  title: string;
  message?: string;
  link?: string;
}) {
  try {
    // Get current user for companyId (notifications should be within same company)
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" }; // Or internal system call?
      // If this is called by system automation (background job), we might not have a session.
      // But typically actions are called from user context.
    }

    // Optional: Verify that target userId belongs to the same company?
    // This adds a DB call but increases security.
    const targetUser = await prisma.user.findFirst({
      where: { id: data.userId, companyId: currentUser.companyId },
    });

    if (!targetUser) {
      console.warn(
        `[createNotification] Target user ${data.userId} not found in company ${currentUser.companyId}`
      );
      // return { success: false, error: "Target user not found" }; // Or just fail silently?
      // Let's proceed only if found to maintain isolation.
      return { success: false, error: "User not in company" };
    }

    const notification = await prisma.notification.create({
      data: {
        companyId: currentUser.companyId, // CRITICAL: Set companyId for multi-tenancy
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
      },
    });
    return { success: true, data: notification };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: "Failed to create notification" };
  }
}

// For use in internal automation
export const sendNotification = createNotification;

/**
 * Create notification for a specific company (for use in automations/cron jobs without session)
 */
export async function createNotificationForCompany(data: {
  companyId: number;
  userId: number;
  title: string;
  message?: string;
  link?: string;
}) {
  try {
    // Verify that target userId belongs to the company
    const targetUser = await prisma.user.findFirst({
      where: { id: data.userId, companyId: data.companyId },
    });

    if (!targetUser) {
      console.warn(
        `[createNotificationForCompany] Target user ${data.userId} not found in company ${data.companyId}`
      );
      return { success: false, error: "User not in company" };
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
    console.log(
      `[Notification] Created notification #${notification.id} for user ${data.userId} (Company ${data.companyId})`
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

    // Verify ownership
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: user.id,
      },
    });

    if (!notification) {
      return {
        success: false,
        error: "Notification not found or unauthorized",
      };
    }

    await prisma.notification.delete({
      where: {
        id: notificationId,
      },
    });

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

    // Verify ownership for all notifications implicitly by including userId in the deleteMany query
    const result = await prisma.notification.deleteMany({
      where: {
        id: {
          in: notificationIds,
        },
        userId: user.id,
      },
    });

    return { success: true, count: result.count };
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return { success: false, error: "Failed to delete notifications" };
  }
}
