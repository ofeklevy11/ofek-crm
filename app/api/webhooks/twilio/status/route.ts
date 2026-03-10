import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { decrypt } from "@/lib/services/encryption";
import { env } from "@/lib/env";
import { validateTwilioSignature } from "@/lib/services/twilio-signature";
import { inngest } from "@/lib/inngest/client";

const log = createLogger("TwilioWebhook");

/**
 * Twilio delivery status webhook.
 * CSRF-exempt and auth-exempt via existing /api/webhooks/ prefix.
 * Twilio sends application/x-www-form-urlencoded POST.
 */
export async function POST(req: NextRequest) {
  let params: Record<string, string>;
  try {
    const formData = await req.formData();
    params = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const accountSid = params.AccountSid;
  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;

  if (!accountSid || !messageSid || !messageStatus) {
    return new NextResponse("Missing required fields", { status: 400 });
  }

  // Rate limit by AccountSid
  const rl = await checkRateLimit(accountSid, RATE_LIMITS.twilioWebhook);
  if (rl) return rl;

  // Look up integration by AccountSid
  const integration = await prisma.smsIntegration.findFirst({
    where: { accountSid },
    select: {
      companyId: true,
      authTokenEnc: true,
      authTokenIv: true,
      authTokenTag: true,
    },
  });

  if (!integration) {
    log.warn("Twilio webhook for unknown account", { accountSid });
    // Return 200 to prevent Twilio retries for unknown accounts
    return new NextResponse("<Response/>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Validate Twilio signature
  const signature = req.headers.get("x-twilio-signature");
  if (signature && env.NEXT_PUBLIC_APP_URL) {
    try {
      const authToken = decrypt(
        {
          ciphertext: integration.authTokenEnc,
          iv: integration.authTokenIv,
          authTag: integration.authTokenTag,
        },
        env.TWILIO_TOKEN_ENCRYPTION_KEY,
      );

      const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`;
      if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
        log.warn("Twilio webhook signature validation failed", {
          accountSid,
          companyId: integration.companyId,
        });
        return new NextResponse("Unauthorized", { status: 401 });
      }
    } catch (err) {
      log.error("Twilio webhook signature validation error", { error: String(err) });
      // Still process — don't block on decryption errors
    }
  }

  // Dispatch status update to Inngest for async processing
  await inngest.send({
    name: "sms/status-update",
    data: {
      companyId: integration.companyId,
      twilioSid: messageSid,
      status: messageStatus.toUpperCase(),
      errorCode: params.ErrorCode || undefined,
      errorMessage: params.ErrorMessage || undefined,
    },
  });

  // Always return 200 to prevent Twilio retries
  return new NextResponse("<Response/>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
