"use server";

import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("NurtureTriggers");

/**
 * Processes date-based nurture triggers for a company.
 * Called from the Inngest function processNurtureDateTriggers.
 *
 * Handles: birthday, renewal, winback
 */
export async function processDateBasedNurtureTriggers(companyId: number) {
  const today = new Date();
  const todayMonth = today.getMonth() + 1; // 1-indexed
  const todayDay = today.getDate();
  const todayYear = today.getFullYear();
  const currentQuarter = Math.ceil(todayMonth / 3);

  // Fetch all enabled date-based nurture lists for this company
  const lists = await prisma.nurtureList.findMany({
    where: {
      companyId,
      isEnabled: true,
      slug: { in: ["birthday", "renewal", "winback"] },
    },
    include: {
      subscribers: {
        where: {
          phoneActive: true,
          phone: { not: null },
          triggerDate: { not: null },
        },
      },
    },
  });

  if (lists.length === 0) return { processed: 0 };

  const { inngest } = await import("@/lib/inngest/client");
  const { migrateConfigMessages, getActiveMessage } = await import("@/lib/nurture-messages");
  let totalProcessed = 0;

  for (const list of lists) {
    const config = (list.configJson as any) || {};
    const channels = config.channels || {};

    if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud) {
      continue;
    }

    const activeMsg = getActiveMessage(migrateConfigMessages(config));
    if (!activeMsg) continue;

    const eligibleSubscribers: {
      id: number;
      phone: string;
      name: string;
      triggerKey: string;
    }[] = [];

    for (const sub of list.subscribers) {
      if (!sub.triggerDate || !sub.phone) continue;

      const triggerDate = new Date(sub.triggerDate);

      if (list.slug === "birthday") {
        const daysBeforeBirthday = parseInt(config.daysBeforeBirthday || "0", 10);
        // Calculate target date: today + daysBeforeBirthday
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysBeforeBirthday);
        const targetMonth = targetDate.getMonth() + 1;
        const targetDay = targetDate.getDate();

        if (
          triggerDate.getMonth() + 1 === targetMonth &&
          triggerDate.getDate() === targetDay
        ) {
          eligibleSubscribers.push({
            id: sub.id,
            phone: sub.phone,
            name: sub.name,
            triggerKey: `birthday-${todayYear}`,
          });
        }
      } else if (list.slug === "renewal") {
        const daysBeforeExpiry = parseInt(config.daysBeforeExpiry || "30", 10);
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
        const targetISO = targetDate.toISOString().split("T")[0];
        const triggerISO = triggerDate.toISOString().split("T")[0];

        if (triggerISO === targetISO) {
          eligibleSubscribers.push({
            id: sub.id,
            phone: sub.phone,
            name: sub.name,
            triggerKey: `renewal-${triggerISO}`,
          });
        }
      } else if (list.slug === "winback") {
        const inactivityDays = parseInt(config.inactivityDays || "90", 10);
        const cutoffDate = new Date(today);
        cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);

        if (triggerDate < cutoffDate) {
          eligibleSubscribers.push({
            id: sub.id,
            phone: sub.phone,
            name: sub.name,
            triggerKey: `winback-${todayYear}-Q${currentQuarter}`,
          });
        }
      }
    }

    if (eligibleSubscribers.length === 0) continue;

    // Batch dedup: insert send logs with skipDuplicates
    await prisma.nurtureSendLog.createMany({
      data: eligibleSubscribers.map((sub) => ({
        subscriberId: sub.id,
        nurtureListId: list.id,
        triggerKey: sub.triggerKey,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });

    // Find which ones were actually inserted (not duplicates)
    const newLogs = await prisma.nurtureSendLog.findMany({
      where: {
        nurtureListId: list.id,
        status: "PENDING",
        subscriberId: { in: eligibleSubscribers.map((s) => s.id) },
        triggerKey: { in: eligibleSubscribers.map((s) => s.triggerKey) },
      },
      select: { subscriberId: true, triggerKey: true },
    });

    const newSubIds = new Set(newLogs.map((l) => l.subscriberId));
    const toSend = eligibleSubscribers.filter((s) => newSubIds.has(s.id));

    if (toSend.length === 0) continue;

    // Dispatch send events
    const events = toSend.map((sub) => ({
      name: "nurture/send-campaign-message" as const,
      data: {
        companyId,
        subscriberPhone: sub.phone,
        subscriberName: sub.name,
        channels,
        smsBody: activeMsg.smsBody || "",
        whatsappGreenBody: activeMsg.whatsappGreenBody || "",
        whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
        whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
        slug: list.slug,
      },
    }));

    await inngest.send(events);

    // Mark as SENT
    await prisma.nurtureSendLog.updateMany({
      where: {
        nurtureListId: list.id,
        status: "PENDING",
        subscriberId: { in: toSend.map((s) => s.id) },
      },
      data: { status: "SENT" },
    });

    totalProcessed += toSend.length;

    log.info("Date-based nurture triggers processed", {
      companyId,
      slug: list.slug,
      eligible: eligibleSubscribers.length,
      sent: toSend.length,
    });
  }

  return { processed: totalProcessed };
}
