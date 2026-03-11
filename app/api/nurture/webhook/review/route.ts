import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { migrateConfigMessages, getActiveMessage } from "@/lib/nurture-messages";

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

    const body = await request.json();
    const { companyId, phone, name } = body;

    if (!companyId || !phone || !name) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, phone, name" },
        { status: 400 }
      );
    }

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

    // Add subscriber if not exists
    const conditions: any[] = [{ phone }];
    const existing = await prisma.nurtureSubscriber.findFirst({
      where: { nurtureListId: list.id, OR: conditions },
    });

    let subscriberId: number;
    if (!existing) {
      const sub = await prisma.nurtureSubscriber.create({
        data: {
          nurtureListId: list.id,
          name,
          phone,
          sourceType: "WEBHOOK",
        },
      });
      subscriberId = sub.id;
    } else {
      subscriberId = existing.id;
    }

    // Calculate delay from timing config
    const timingMap: Record<string, number> = {
      immediate: 0,
      "1_hour": 3600000,
      "24_hours": 86400000,
      "3_days": 259200000,
    };
    const delayMs = timingMap[config.timing] || 0;
    const triggerKey = `review-webhook-${Date.now()}`;
    const activeMsg = getActiveMessage(migrateConfigMessages(config));

    // Dispatch delayed send
    await inngest.send({
      name: "nurture/delayed-send",
      data: {
        companyId,
        subscriberId,
        nurtureListId: list.id,
        subscriberPhone: phone,
        subscriberName: name,
        channels,
        smsBody: activeMsg?.smsBody || "",
        whatsappGreenBody: activeMsg?.whatsappGreenBody || "",
        whatsappCloudTemplateName: activeMsg?.whatsappCloudTemplateName || "",
        whatsappCloudLanguageCode: activeMsg?.whatsappCloudLanguageCode || "he",
        slug: "review",
        delayMs,
        triggerKey,
      },
    });

    log.info("Review webhook processed", { companyId, phone, delayMs });

    return NextResponse.json({ success: true, delayMs });
  } catch (error) {
    log.error("Review webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
