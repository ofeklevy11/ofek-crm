"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getNotifications(
  userId: number,
  limit: number | null = 20
) {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit ? limit : undefined, // If limit is null/0, take all (undefined means no limit in prisma usually, or we can just omit take)
    });
    return { success: true, data: notifications };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { success: false, error: "Failed to fetch notifications" };
  }
}

export async function markAsRead(notificationId: number) {
  try {
    await prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        read: true,
      },
    });
    // We don't necessarily need to revalidate path here if we update local state,
    // but proper revalidation is good.
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
    const notification = await prisma.notification.create({
      data: {
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
