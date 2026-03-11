import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { migrateConfigMessages, getActiveMessage } from "@/components/nurture/NurtureMessageEditor";

const log = createLogger("NurtureWebhook:Upsell");

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
    const { companyId, phone, name, triggerEvent } = body;

    if (!companyId || !phone || !name) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, phone, name" },
        { status: 400 }
      );
    }

    // Find the upsell nurture list
    const list = await prisma.nurtureList.findFirst({
      where: { companyId, slug: "upsell", isEnabled: true },
    });

    if (!list || !list.configJson) {
      return NextResponse.json({ error: "Upsell automation not configured or disabled" }, { status: 404 });
    }

    const config = list.configJson as any;
    const channels = config.channels || {};

    if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud) {
      return NextResponse.json({ error: "No channels configured" }, { status: 400 });
    }

    // Check if trigger event matches config (if specified)
    if (triggerEvent && config.triggerEvent && triggerEvent !== config.triggerEvent) {
      return NextResponse.json({ error: "Trigger event mismatch" }, { status: 400 });
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

    const delayMs = parseInt(config.delayMinutes || "15", 10) * 60000;
    const triggerKey = `upsell-webhook-${Date.now()}`;
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
        slug: "upsell",
        delayMs,
        triggerKey,
      },
    });

    log.info("Upsell webhook processed", { companyId, phone, delayMs, triggerEvent });

    return NextResponse.json({ success: true, delayMs });
  } catch (error) {
    log.error("Upsell webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
