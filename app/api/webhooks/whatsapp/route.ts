import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import type { WebhookPayload, WebhookChangeValue } from "@/lib/whatsapp/types";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("WhatsAppWebhook");

/**
 * GET — Meta webhook verification.
 * Meta sends hub.mode, hub.verify_token, hub.challenge.
 * We look up the verify token in WhatsAppAccount to find the tenant.
 */
async function handleGET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Check env-based verify token first (useful for testing)
  const envToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (envToken && token === envToken) {
    log.info("Webhook verified via env token");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Find a WhatsApp account with this verify token
  const account = await prisma.whatsAppAccount.findFirst({
    where: { webhookVerifyToken: token },
    select: { id: true },
  });

  if (!account) {
    log.error("Webhook verification failed: unknown verify token");
    return new NextResponse("Forbidden", { status: 403 });
  }

  log.info("Webhook verified", { accountId: account.id });
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * POST — Incoming webhook events from Meta.
 * Validates signature, routes by phone_number_id, dispatches to Inngest.
 * Always returns 200 to prevent Meta retries (idempotency handled in Inngest jobs).
 */
async function handlePOST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    log.error("WHATSAPP_APP_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify X-Hub-Signature-256
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    log.error("Missing X-Hub-Signature-256 header");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const expectedSignature =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      log.error("Invalid webhook signature");
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } catch {
    log.error("Signature comparison error");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.error("Invalid JSON body");
    return new NextResponse("Bad request", { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored" });
  }

  // Process each entry/change
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Rate limit per phone number — log warning but still dispatch to Inngest
      // (Inngest concurrency controls handle backpressure; dropping events loses messages)
      const rateLimited = await checkRateLimit(
        phoneNumberId,
        RATE_LIMITS.whatsappWebhook,
      );
      if (rateLimited) {
        log.error("Webhook rate limited — still dispatching", {
          phoneNumberId,
          messageCount: value.messages?.length ?? 0,
          statusCount: value.statuses?.length ?? 0,
        });
      }

      // Route to tenant
      const phoneRecord = await prisma.whatsAppPhoneNumber.findUnique({
        where: { phoneNumberId },
        select: { companyId: true, id: true, accountId: true },
      });

      if (!phoneRecord) {
        log.error("Unknown phone number ID in webhook", { phoneNumberId });
        continue;
      }

      await dispatchEvents(value, phoneRecord.companyId, phoneRecord.id, phoneRecord.accountId);
    }
  }

  return NextResponse.json({ status: "ok" });
}
 
async function dispatchEvents(
  value: WebhookChangeValue,
  companyId: number,
  phoneNumberDbId: number,
  accountId: number,
) {
  // Dispatch incoming messages
  if (value.messages?.length) {
    for (const msg of value.messages) {
      const contactInfo = value.contacts?.find((c) => c.wa_id === msg.from);
      await inngest.send({
        name: "whatsapp/incoming-message",
        data: {
          companyId,
          phoneNumberDbId,
          accountId,
          phoneNumberId: value.metadata.phone_number_id,
          message: msg,
          contactProfile: contactInfo?.profile?.name || null,
          contactWaId: msg.from,
        },
      });
    }
  }

  // Dispatch status updates
  if (value.statuses?.length) {
    for (const status of value.statuses) {
      await inngest.send({
        name: "whatsapp/status-update",
        data: {
          companyId,
          phoneNumberDbId,
          wamId: status.id,
          status: status.status,
          timestamp: status.timestamp,
          recipientId: status.recipient_id,
          errors: status.errors || null,
        },
      });
    }
  }
}

export const GET = withMetrics("/api/webhooks/whatsapp", handleGET);
export const POST = withMetrics("/api/webhooks/whatsapp", handlePOST);
