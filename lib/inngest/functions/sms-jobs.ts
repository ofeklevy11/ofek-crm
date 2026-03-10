import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { createLogger } from "@/lib/logger";
import { env } from "@/lib/env";
import { decrypt } from "@/lib/services/encryption";
import { getMonthlySmsLimit } from "@/lib/plan-limits";
import { normalizeToE164 } from "@/lib/utils/phone";
import { sendSms, TwilioSendError } from "@/lib/services/twilio-api";

const log = createLogger("SmsJobs");

// Status transition priority — only allow "forward" transitions
const STATUS_PRIORITY: Record<string, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  UNDELIVERED: 3,
  FAILED: 4,
};

// ─── Send SMS Job ──────────────────────────────────────────────

export const sendSmsJob = inngest.createFunction(
  {
    id: "send-sms-message",
    name: "Send SMS Message",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: [
      { limit: 2, key: "event.data.companyId" },
      { limit: 10 },
    ],
  },
  { event: "sms/send-message" },
  async ({ event, step }) => {
    const { companyId, toNumber, body, sentByUserId, automationRuleId } =
      event.data;

    // Step 1: Load integration and validate
    const integration = await step.run("load-integration", async () => {
      const { prisma } = await import("@/lib/prisma");
      const integ = await prisma.smsIntegration.findUnique({
        where: { companyId },
      });
      if (!integ || integ.status !== "READY") {
        throw new NonRetriableError(
          `SMS integration not ready for company ${companyId}`,
        );
      }
      if (!integ.fromNumber) {
        throw new NonRetriableError("No from number configured");
      }
      return {
        id: integ.id,
        accountSid: integ.accountSid,
        authTokenEnc: integ.authTokenEnc,
        authTokenIv: integ.authTokenIv,
        authTokenTag: integ.authTokenTag,
        fromNumber: integ.fromNumber,
      };
    });

    // Step 2: Check monthly limit
    await step.run("check-monthly-limit", async () => {
      const { prisma } = await import("@/lib/prisma");
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [count, company] = await Promise.all([
        prisma.smsMessage.count({
          where: {
            companyId,
            createdAt: { gte: firstOfMonth },
            direction: "OUTBOUND",
          },
        }),
        prisma.user.findFirst({
          where: { companyId, role: "admin" },
          select: { isPremium: true },
        }),
      ]);

      const limit = getMonthlySmsLimit(company?.isPremium);
      if (count >= limit) {
        throw new NonRetriableError(
          `Monthly SMS limit reached (${count}/${limit})`,
        );
      }
    });

    // Step 3: Send via Twilio
    const result = await step.run("send-sms", async () => {
      const authToken = decrypt(
        {
          ciphertext: integration.authTokenEnc,
          iv: integration.authTokenIv,
          authTag: integration.authTokenTag,
        },
        env.TWILIO_TOKEN_ENCRYPTION_KEY,
      );

      const statusCallbackUrl = env.NEXT_PUBLIC_APP_URL
        ? `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`
        : undefined;

      return sendSms(
        integration.accountSid,
        authToken,
        integration.fromNumber,
        toNumber,
        body,
        statusCallbackUrl,
      );
    });

    // Step 4: Store message record
    await step.run("store-message", async () => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.smsMessage.create({
        data: {
          companyId,
          integrationId: integration.id,
          twilioSid: result.sid,
          fromNumber: integration.fromNumber,
          toNumber,
          body,
          status: result.status.toUpperCase(),
          sentByUserId: sentByUserId ?? null,
          automationRuleId: automationRuleId ?? null,
        },
      });
    });

    log.info("SMS sent", { companyId, twilioSid: result.sid });
    return { sid: result.sid };
  },
);

// ─── Automation Send SMS Job ───────────────────────────────────

export const sendSmsAutomationJob = inngest.createFunction(
  {
    id: "automation-send-sms",
    name: "Automation Send SMS",
    retries: 2,
    timeouts: { finish: "90s" },
    concurrency: [{ limit: 3, key: "event.data.companyId" }],
  },
  { event: "automation/send-sms" },
  async ({ event, step }) => {
    const { companyId, phone, content, delay } = event.data;

    // Optional delay for automation scheduling
    if (delay && delay > 0) {
      await step.sleep("automation-delay", `${Math.min(delay, 3600)}s`);
    }

    // Normalize phone number
    const normalized = normalizeToE164(phone);
    if (!normalized) {
      log.warn("Invalid phone number in automation", { companyId, phone });
      throw new NonRetriableError(`Invalid phone number: ${phone}`);
    }

    // Dispatch to the main send job
    await step.sendEvent("dispatch-sms", {
      name: "sms/send-message",
      data: {
        companyId,
        toNumber: normalized,
        body: content,
      },
    });
  },
);

// ─── Process Status Update Job ─────────────────────────────────

export const processSmsStatusUpdate = inngest.createFunction(
  {
    id: "process-sms-status-update",
    name: "Process SMS Status Update",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: [{ limit: 5, key: "event.data.companyId" }],
  },
  { event: "sms/status-update" },
  async ({ event, step }) => {
    const { companyId, twilioSid, status, errorCode, errorMessage } =
      event.data;

    await step.run("update-message-status", async () => {
      const { prisma } = await import("@/lib/prisma");

      const message = await prisma.smsMessage.findUnique({
        where: { twilioSid },
        select: { id: true, companyId: true, status: true },
      });

      if (!message) {
        log.warn("SMS status update for unknown message", { twilioSid });
        return;
      }

      // Tenant isolation check
      if (message.companyId !== companyId) {
        log.error("SMS status update company mismatch", {
          twilioSid,
          expected: companyId,
          actual: message.companyId,
        });
        return;
      }

      // Only allow forward status transitions
      const currentPriority = STATUS_PRIORITY[message.status] ?? -1;
      const newPriority = STATUS_PRIORITY[status] ?? -1;
      if (newPriority <= currentPriority && status !== "FAILED" && status !== "UNDELIVERED") {
        return; // Ignore backward transitions (except terminal failures)
      }

      await prisma.smsMessage.update({
        where: { twilioSid },
        data: {
          status,
          errorCode: errorCode ?? undefined,
          errorMessage: errorMessage ?? undefined,
        },
      });

      log.info("SMS status updated", { twilioSid, status });
    });
  },
);
