import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { normalizeToE164 } from "@/lib/utils/phone";

const log = createLogger("NurtureJobs");

/**
 * Fan-out job: sends a nurture message to a single subscriber
 * through all configured channels.
 */
export const sendNurtureCampaignMessage = inngest.createFunction(
  {
    id: "nurture-send-campaign-message",
    name: "Nurture: Send Campaign Message",
    retries: 2,
    timeouts: { finish: "120s" },
    concurrency: [{ limit: 5, key: "event.data.companyId" }],
  },
  { event: "nurture/send-campaign-message" },
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
      batchId,
    } = event.data;

    // Mark as sending in batch queue
    if (batchId) {
      try {
        const { updateQueueItemStatus } = await import("@/lib/nurture-queue");
        await updateQueueItemStatus(batchId, subscriberPhone, "sending");
      } catch { /* non-critical */ }
    }

    const interpolate = (text: string) =>
      text.replace(/\{first_name\}/g, subscriberName);

    let hasFailed = false;

    // Send SMS
    if (!channels.sms) {
      log.info("SMS channel not enabled", { companyId, slug });
    } else if (!smsBody) {
      log.warn("SMS skipped — empty message body", { companyId, slug });
    } else {
      const normalizedPhone = normalizeToE164(subscriberPhone);
      if (!normalizedPhone) {
        log.warn("Nurture SMS skipped — invalid phone", { companyId, slug, phone: subscriberPhone });
      } else {
        await step.sendEvent("send-sms", {
          name: "sms/send-message",
          data: {
            companyId,
            toNumber: normalizedPhone,
            body: interpolate(smsBody),
          },
        });
        log.info("Nurture SMS queued", { companyId, slug, phone: normalizedPhone });
      }
    }

    // Send WhatsApp via Green API
    if (channels.whatsappGreen && whatsappGreenBody) {
      await step.sendEvent("send-whatsapp-green", {
        name: "automation/send-whatsapp",
        data: {
          companyId,
          phone: subscriberPhone,
          content: interpolate(whatsappGreenBody),
        },
      });
      log.info("Nurture WhatsApp Green queued", { companyId, slug, phone: subscriberPhone });
    }

    // Send WhatsApp via Cloud API (template message)
    if (channels.whatsappCloud && whatsappCloudTemplateName) {
      await step.run("send-whatsapp-cloud", async () => {
        try {
          const { sendTemplateMessage } = await import(
            "@/lib/services/whatsapp-cloud-api"
          );
          const { decrypt } = await import("@/lib/services/encryption");

          // phoneNumbers relation
          const account = await (prisma.whatsAppAccount as any).findFirst({
            where: { companyId, status: "ACTIVE" },
            include: { phoneNumbers: { where: { isActive: true }, take: 1 } },
          });

          if (!account || (account as any).phoneNumbers?.length === 0) {
            log.warn("No active WhatsApp Cloud account/phone", { companyId });
            return;
          }

          const phoneNumber = (account as any).phoneNumbers[0];
          const accessToken = decrypt({
            ciphertext: (account as any).accessTokenEnc,
            iv: (account as any).accessTokenIv,
            authTag: (account as any).accessTokenTag,
          });

          await sendTemplateMessage(
            phoneNumber.phoneNumberId,
            accessToken,
            subscriberPhone,
            whatsappCloudTemplateName,
            whatsappCloudLanguageCode || "he"
          );

          log.info("Nurture WhatsApp Cloud sent", {
            companyId,
            slug,
            phone: subscriberPhone,
            template: whatsappCloudTemplateName,
          });
        } catch (err) {
          hasFailed = true;
          log.error("Nurture WhatsApp Cloud failed", {
            companyId,
            slug,
            phone: subscriberPhone,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    // Update batch queue with final status
    if (batchId) {
      try {
        const { updateQueueItemStatus } = await import("@/lib/nurture-queue");
        await updateQueueItemStatus(batchId, subscriberPhone, hasFailed ? "failed" : "sent");
      } catch { /* non-critical */ }
    }

    // Update NurtureSendLog with delivery status (for automated triggers)
    if (subscriberId && nurtureListId) {
      try {
        await prisma.nurtureSendLog.updateMany({
          where: {
            subscriberId,
            nurtureListId,
            status: "DISPATCHED",
          },
          data: { status: hasFailed ? "FAILED" : "SENT" },
        });
      } catch { /* non-critical — log already exists with DISPATCHED */ }
    }

    return { success: !hasFailed };
  }
);
