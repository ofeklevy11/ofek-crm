"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import {
  parseNotificationSettings,
  invalidateNotificationSettingsCache,
  type NotificationSettings,
} from "@/lib/notification-settings";

export async function getNotificationSettings(): Promise<{
  success: boolean;
  data?: NotificationSettings;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "admin") return { success: false, error: "Forbidden" };

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { notificationSettings: true },
  });

  return {
    success: true,
    data: parseNotificationSettings(company?.notificationSettings),
  };
}

export async function updateNotificationSettings(
  data: Partial<NotificationSettings>,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "admin") return { success: false, error: "Forbidden" };

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { notificationSettings: true },
  });

  const current = parseNotificationSettings(company?.notificationSettings);
  const updated: Record<string, boolean> = { ...current };

  for (const [key, value] of Object.entries(data)) {
    if (key in current && typeof value === "boolean") {
      updated[key] = value;
    }
  }

  await prisma.company.update({
    where: { id: user.companyId },
    data: { notificationSettings: updated },
  });

  await invalidateNotificationSettingsCache(user.companyId);

  return { success: true };
}
