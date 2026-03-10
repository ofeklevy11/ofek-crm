import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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
      subscriberPhone,
      subscriberName,
      channels,
      smsBody,
      whatsappGreenBody,
      whatsappCloudTemplateName,
      whatsappCloudLanguageCode,
      slug,
    } = event.data;

    const interpolate = (text: string) =>
      text.replace(/\{first_name\}/g, subscriberName);

    // Send SMS
    if (channels.sms && smsBody) {
      await step.sendEvent("send-sms", {
        name: "sms/send-message",
        data: {
          companyId,
          toNumber: subscriberPhone,
          body: interpolate(smsBody),
        },
      });
      log.info("Nurture SMS queued", { companyId, slug, phone: subscriberPhone });
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
          log.error("Nurture WhatsApp Cloud failed", {
            companyId,
            slug,
            phone: subscriberPhone,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return { success: true };
  }
);
