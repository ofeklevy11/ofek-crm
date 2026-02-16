import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { createHmac, randomBytes } from "crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("WhatsappJobs");

/**
 * Dedicated background job for sending WhatsApp messages via Green API.
 * - Retries with exponential backoff (up to 5 attempts)
 * - Rate-limited to 2 concurrent sends per company + 10 globally
 * - Isolated failures don't affect other automation actions
 */
export const sendWhatsAppJob = inngest.createFunction(
  {
    id: "send-whatsapp-message",
    name: "Send WhatsApp Message",
    retries: 5,
    timeouts: { finish: "60s" },
    concurrency: [
      { limit: 2, key: "event.data.companyId" },
      { limit: 5 }, // global cap to protect Green API rate limits
    ],
  },
  { event: "automation/send-whatsapp" },
  async ({ event, step }) => {
    const { companyId, phone: rawPhone, content, messageType, mediaFileId, delay } = event.data;

    // Honor configured delay using step.sleep (non-blocking)
    if (delay) {
      const delaySec = Math.min(Number(delay), 60); // cap at 60s
      await step.sleep("wa-delay", `${delaySec}s`);
    }

    // BB18: Normalize phone to digits only (E.164 format for Green API)
    const phone = rawPhone ? String(rawPhone).replace(/[^0-9]/g, "") : "";
    if (!phone) {
      throw new NonRetriableError("WhatsApp job: No phone number provided");
    }

    await step.run("send-message", async () => {
      const { sendGreenApiMessage, sendGreenApiFile } = await import(
        "@/lib/services/green-api"
      );

      if (messageType === "media" && mediaFileId) {
        const { prisma } = await import("@/lib/prisma");
        const file = await prisma.file.findFirst({
          where: { id: Number(mediaFileId), companyId },
        });

        if (!file?.url) {
          throw new NonRetriableError(`WhatsApp job: File not found: ${mediaFileId}`);
        }

        await sendGreenApiFile(companyId, String(phone), file.url, file.name, content);
      } else {
        await sendGreenApiMessage(companyId, String(phone), content);
      }

      log.info("WhatsApp message sent", { companyId });
    });

    return { success: true, phone: phone.slice(0, 3) + "****" + phone.slice(-2) };
  },
);

/**
 * Dedicated background job for executing webhook calls.
 * - Retries with exponential backoff (up to 4 attempts)
 * - Rate-limited to 5 concurrent calls per company
 * - 30s timeout per request
 */
export const sendWebhookJob = inngest.createFunction(
  {
    id: "send-webhook",
    name: "Send Webhook",
    retries: 4,
    timeouts: { finish: "60s" },
    concurrency: [
      { limit: 3, key: "event.data.companyId" },
      { limit: 5 }, // global cap
    ],
  },
  { event: "automation/send-webhook" },
  async ({ event, step }) => {
    const { url, payload, ruleId, companyId } = event.data;

    if (!url) {
      throw new NonRetriableError(`Webhook job: No URL provided for rule ${ruleId}`);
    }

    // BB7: Block SSRF — prevent webhooks to internal/private IPs
    if (isPrivateUrl(url)) {
      throw new NonRetriableError(`Webhook job: URL targets a private/internal address for rule ${ruleId}`);
    }

    // SECURITY: companyId is mandatory for all webhook jobs
    if (!companyId) {
      throw new NonRetriableError("Webhook job: Missing companyId");
    }

    // Validate that the automation rule belongs to this company
    if (ruleId) {
      await step.run("validate-rule-ownership", async () => {
        const { prisma } = await import("@/lib/prisma");
        const rule = await prisma.automationRule.findFirst({
          where: { id: Number(ruleId), companyId: Number(companyId) },
          select: { id: true },
        });
        if (!rule) {
          throw new NonRetriableError(
            `Webhook job: Rule ${ruleId} does not belong to company ${companyId}`,
          );
        }
      });
    }

    // Fetch or generate webhook signing secret for this company (atomic to prevent race condition)
    const signingSecret = await step.run("get-signing-secret", async () => {
      const { prisma } = await import("@/lib/prisma");
      const newSecret = randomBytes(32).toString("hex");

      // Atomic set-if-null: COALESCE ensures only the first writer's secret is kept
      const result = await prisma.$queryRaw<{ webhookSigningSecret: string }[]>`
        UPDATE "Company"
        SET "webhookSigningSecret" = COALESCE("webhookSigningSecret", ${newSecret})
        WHERE id = ${Number(companyId)}
        RETURNING "webhookSigningSecret"
      `;

      if (!result[0]?.webhookSigningSecret) {
        throw new Error(`Company ${companyId} not found`);
      }
      return result[0].webhookSigningSecret;
    });

    const result = await step.run("send-webhook", async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const enrichedPayload = { ...payload, timestamp: new Date().toISOString() };
      const body = JSON.stringify(enrichedPayload);

      // HMAC-SHA256 signature: sign "{timestamp}.{body}" to bind timestamp to payload
      const signature = createHmac("sha256", signingSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex");

      // SECURITY: Log only hostname, not full URL (may contain sensitive query params)
      const urlHostname = (() => { try { return new URL(url).hostname; } catch { return "invalid-url"; } })();
      log.info("Sending webhook", { hostname: urlHostname, ruleId });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Timestamp": timestamp,
        },
        body,
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });

      if (!response.ok) {
        const msg = `Webhook failed: ${response.status} ${response.statusText}`;
        log.error("Webhook request failed", { status: response.status, statusText: response.statusText });
        throw new Error(msg);
      }

      log.info("Webhook sent successfully", { ruleId });
      return { success: true, status: response.status };
    });

    return result;
  },
);
