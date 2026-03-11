import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = createLogger("NurtureTriggerJobs");

/**
 * Processes date-based nurture triggers (birthday, renewal, winback)
 * for a single company. Dispatched from cron route.
 */
export const processNurtureDateTriggers = inngest.createFunction(
  {
    id: "nurture-process-date-triggers",
    name: "Nurture: Process Date-Based Triggers",
    retries: 2,
    timeouts: { finish: "120s" },
    concurrency: [{ limit: 3, key: "event.data.companyId" }],
  },
  { event: "nurture/process-date-triggers" },
  async ({ event, step }) => {
    const { companyId } = event.data;

    const result = await step.run("process-date-triggers", async () => {
      const { processDateBasedNurtureTriggers } = await import(
        "@/app/actions/nurture-triggers"
      );
      return processDateBasedNurtureTriggers(companyId);
    });

    return result;
  }
);

/**
 * Delayed send for event-based nurture (review, upsell).
 * Uses step.sleep() for configured delay then dispatches send.
 */
export const nurtureDelayedSend = inngest.createFunction(
  {
    id: "nurture-delayed-send",
    name: "Nurture: Delayed Send",
    retries: 2,
    timeouts: { finish: "300s" },
    concurrency: [{ limit: 5, key: "event.data.companyId" }],
  },
  { event: "nurture/delayed-send" },
  async ({ event, step }) => {
    const {
      companyId,
      subscriberId,
      nurtureListId,
      subscriberPhone,
      subscriberName,
      channels,
      smsBody,
      whatsappGreenBody,
      whatsappCloudTemplateName,
      whatsappCloudLanguageCode,
      slug,
      delayMs,
      triggerKey,
    } = event.data;

    // Sleep for configured delay
    if (delayMs > 0) {
      await step.sleep("wait-delay", `${delayMs}ms`);
    }

    // Check dedup — skip if already sent
    const existing = await step.run("check-dedup", async () => {
      return prisma.nurtureSendLog.findUnique({
        where: {
          subscriberId_nurtureListId_triggerKey: {
            subscriberId,
            nurtureListId,
            triggerKey,
          },
        },
      });
    });

    if (existing) {
      log.info("Skipping duplicate delayed send", { subscriberId, triggerKey });
      return { skipped: true };
    }

    // Log the send
    await step.run("log-send", async () => {
      await prisma.nurtureSendLog.create({
        data: {
          subscriberId,
          nurtureListId,
          triggerKey,
          status: "SENT",
        },
      });
    });

    // Dispatch actual message send
    await step.sendEvent("send-message", {
      name: "nurture/send-campaign-message",
      data: {
        companyId,
        subscriberPhone,
        subscriberName,
        channels,
        smsBody,
        whatsappGreenBody,
        whatsappCloudTemplateName,
        whatsappCloudLanguageCode,
        slug,
      },
    });

    log.info("Delayed nurture send dispatched", {
      companyId,
      slug,
      subscriberId,
      triggerKey,
      delayMs,
    });

    return { success: true };
  }
);
