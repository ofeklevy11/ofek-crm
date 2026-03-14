import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { migrateConfigMessages, getActiveMessage, NURTURE_TIMING_MAP } from "@/lib/nurture-messages";
import { normalizeToE164 } from "@/lib/utils/phone";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logSecurityEvent, SEC_NURTURE_WEBHOOK_RECEIVED } from "@/lib/security/audit-security";
import { getClientIp } from "@/lib/request-ip";

const log = createLogger("NurtureWebhook:Review");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = process.env.NURTURE_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${secret}`;
    if (
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Request body size guard (10KB)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 10240) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    const body = await request.json();
    const { companyId, phone, name } = body;

    if (!companyId || !phone || !name) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, phone, name" },
        { status: 400 }
      );
    }

    // Input validation
    if (typeof companyId !== "number" || !Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "Invalid companyId" }, { status: 400 });
    }
    if (typeof name !== "string" || name.length > 200) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof phone !== "string" || phone.length > 50) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }

    // Rate limit per company
    const rateLimited = await checkRateLimit(String(companyId), RATE_LIMITS.nurtureWebhook);
    if (rateLimited) return rateLimited;

    // Find the review nurture list
    const list = await prisma.nurtureList.findFirst({
      where: { companyId, slug: "review", isEnabled: true },
    });

    if (!list || !list.configJson) {
      return NextResponse.json({ error: "Review automation not configured or disabled" }, { status: 404 });
    }

    const config = list.configJson as any;
    const channels = config.channels || {};

    if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud) {
      return NextResponse.json({ error: "No channels configured" }, { status: 400 });
    }

    // Normalize phone to E164 before storage/lookup
    const normalizedPhone = normalizeToE164(phone) || phone;

    // Add subscriber if not exists (search both normalized and raw for dedup)
    const phoneVariants = [normalizedPhone];
    if (normalizedPhone !== phone) phoneVariants.push(phone);
    const existing = await prisma.nurtureSubscriber.findFirst({
      where: { nurtureListId: list.id, OR: phoneVariants.map(p => ({ phone: p })) },
    });

    let subscriberId: number;
    if (!existing) {
      const sub = await prisma.nurtureSubscriber.create({
        data: {
          nurtureListId: list.id,
          name: name.trim(),
          phone: normalizedPhone,
          sourceType: "WEBHOOK",
        },
      });
      subscriberId = sub.id;
    } else {
      subscriberId = existing.id;
    }

    // Calculate delay from timing config
    const delayMs = NURTURE_TIMING_MAP[config.timing] ?? 0;
    const triggerKey = `review-webhook-${Date.now()}`;
    const activeMsg = getActiveMessage(migrateConfigMessages(config));

    // Dispatch delayed send
    await inngest.send({
      name: "nurture/delayed-send",
      data: {
        companyId,
        subscriberId,
        nurtureListId: list.id,
        subscriberPhone: normalizedPhone,
        subscriberName: name.trim(),
        channels,
        smsBody: activeMsg?.smsBody || "",
        whatsappGreenBody: activeMsg?.whatsappGreenBody || "",
        whatsappCloudTemplateName: activeMsg?.whatsappCloudTemplateName || "",
        whatsappCloudLanguageCode: activeMsg?.whatsappCloudLanguageCode || "he",
        subscriberEmail: "",
        emailSubject: activeMsg?.emailSubject || "",
        emailBody: activeMsg?.emailBody || "",
        slug: "review",
        delayMs,
        triggerKey,
      },
    });

    log.info("Review webhook processed", { companyId, phone: normalizedPhone, delayMs });

    // Security audit log (fire-and-forget)
    logSecurityEvent({
      action: SEC_NURTURE_WEBHOOK_RECEIVED,
      companyId,
      ip: getClientIp(request),
      details: { slug: "review", subscriberId },
    });

    return NextResponse.json({ success: true, delayMs });
  } catch (error) {
    log.error("Review webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
