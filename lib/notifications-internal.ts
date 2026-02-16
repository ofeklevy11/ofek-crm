/**
 * Internal notification helper — NOT a "use server" file.
 * Safe to call from background jobs (Inngest, cron) and server actions.
 * Do NOT add "use server" to this file.
 */

import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("Notifications");

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
      select: { id: true },
    });

    if (!targetUser) {
      log.warn("Target user not found in company", { userId: data.userId, companyId: data.companyId });
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
        data: { userId: data.userId, companyId: data.companyId, notification: safeNotification },
      });
    } catch (err) {
      log.error("Inngest broadcast failed for company notification, saved but SSE skipped", { error: String(err) });
    }
    // -----------------------

    log.info("Created notification", { notificationId: Number(notification.id), userId: data.userId, companyId: data.companyId });
    return { success: true, data: safeNotification };
  } catch (error) {
    log.error("Error creating company notification", { error: String(error) });
    return { success: false, error: "Failed to create notification" };
  }
}
