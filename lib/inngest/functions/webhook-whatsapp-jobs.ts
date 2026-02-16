import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { isIP } from "net";

/**
 * BB7: Validate webhook URL against SSRF — block private/internal IPs.
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Block common private/internal hostnames
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return true;
    }

    // Block private IP ranges
    if (isIP(hostname)) {
      const parts = hostname.split(".").map(Number);
      if (parts[0] === 10) return true; // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return true; // link-local
    }

    return false;
  } catch {
    return true; // Malformed URL — block
  }
}

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

      console.log(`[WhatsApp Job] Message sent to ${phone} (company ${companyId})`);
    });

    return { success: true, phone };
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

    const result = await step.run("send-webhook", async () => {
      // Set timestamp at actual send time (not enqueue time)
      const enrichedPayload = { ...payload, timestamp: new Date().toISOString() };

      console.log(`[Webhook Job] Sending to ${url} for rule ${ruleId}`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedPayload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const msg = `Webhook failed: ${response.status} ${response.statusText} — ${text.substring(0, 200)}`;
        console.error(`[Webhook Job] ${msg}`);
        throw new Error(msg);
      }

      console.log(`[Webhook Job] Success for rule ${ruleId}`);
      return { success: true, status: response.status };
    });

    return result;
  },
);
