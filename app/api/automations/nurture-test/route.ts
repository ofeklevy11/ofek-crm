import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { migrateConfigMessages, getActiveMessage } from "@/lib/nurture-messages";
import { normalizeToE164 } from "@/lib/utils/phone";

const log = createLogger("NurtureTest");

export const dynamic = "force-dynamic";

/**
 * Test endpoint for nurture date-based triggers.
 * Protected by CRON_SECRET.
 *
 * Modes:
 *   ?mode=dry&slug=renewal          — show all subscribers, eligibility, dedup status
 *   ?mode=force&slug=renewal&phone=0502611930 — bypass date logic, send to this phone NOW
 *   ?mode=cleanup&slug=renewal&phone=0502611930 — delete send logs so you can re-test
 *
 * Phone param works in both formats: 0502611930 or +972502611930
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    const expected = `Bearer ${secret}`;
    if (
      !secret ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "dry";
    const slug = url.searchParams.get("slug");
    const rawPhone = url.searchParams.get("phone");

    if (!slug) {
      return NextResponse.json({ error: "slug param required (renewal|winback|birthday)" }, { status: 400 });
    }

    if (mode === "live") return handleLiveMode(slug);
    if (mode === "force") return handleForceMode(slug, rawPhone);
    if (mode === "cleanup") return handleCleanupMode(slug, rawPhone);
    return handleDryMode(slug, rawPhone);
  } catch (error) {
    log.error("Nurture test endpoint error", { error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────

function phoneVariants(raw: string): string[] {
  const variants = [raw];
  const e164 = normalizeToE164(raw);
  if (e164 && e164 !== raw) variants.push(e164);
  // Also try without + prefix
  if (raw.startsWith("+")) variants.push(raw.slice(1));
  return variants;
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── DRY MODE ───────────────────────────────────────────────

async function handleDryMode(slug: string, rawPhone: string | null) {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const currentQuarter = Math.ceil(todayMonth / 3);

  const phoneFilter = rawPhone ? { phone: { in: phoneVariants(rawPhone) } } : {};

  const lists = await prisma.nurtureList.findMany({
    where: { slug, isEnabled: true },
    include: {
      subscribers: {
        where: { phoneActive: true, phone: { not: null }, triggerDate: { not: null }, ...phoneFilter },
      },
      sendLogs: true,
    },
  });

  if (lists.length === 0) {
    return NextResponse.json({ mode: "dry", error: `No enabled list found for slug "${slug}"` });
  }

  const results: any[] = [];

  for (const list of lists) {
    const config = (list.configJson as any) || {};
    const channels = config.channels || {};
    const activeMsg = getActiveMessage(migrateConfigMessages(config));

    const subscribers: any[] = [];

    for (const sub of list.subscribers) {
      if (!sub.triggerDate || !sub.phone) continue;
      const triggerDate = new Date(sub.triggerDate);
      let isEligible = false;
      let reason = "";
      let triggerKey = "";

      if (slug === "birthday") {
        const days = parseInt(config.daysBeforeBirthday || "0", 10);
        const target = new Date(today);
        target.setDate(target.getDate() + days);
        if (triggerDate.getMonth() + 1 === target.getMonth() + 1 && triggerDate.getDate() === target.getDate()) {
          isEligible = true;
          triggerKey = `birthday-${todayYear}`;
          reason = `Birthday matches (today + ${days}d)`;
        } else {
          reason = `Birthday ${triggerDate.getMonth() + 1}/${triggerDate.getDate()} != target ${target.getMonth() + 1}/${target.getDate()}`;
        }
      } else if (slug === "renewal") {
        const days = parseInt(config.daysBeforeExpiry || "30", 10);
        const target = new Date(today);
        target.setDate(target.getDate() + days);
        const targetISO = fmtDate(target);
        const triggerISO = fmtDate(triggerDate);
        if (triggerISO === targetISO) {
          isEligible = true;
          triggerKey = `renewal-${triggerISO}`;
          reason = `Expiry ${triggerISO} == today + ${days}d`;
        } else {
          reason = `Expiry ${triggerISO} != target ${targetISO} (today + ${days}d)`;
        }
      } else if (slug === "winback") {
        const days = parseInt(config.inactivityDays || "90", 10);
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - days);
        const daysSince = Math.floor((today.getTime() - triggerDate.getTime()) / 86_400_000);
        if (triggerDate < cutoff) {
          isEligible = true;
          triggerKey = `winback-${todayYear}-Q${currentQuarter}`;
          reason = `Inactive ${daysSince}d > ${days}d threshold`;
        } else {
          reason = `Inactive ${daysSince}d <= ${days}d threshold`;
        }
      }

      // Check dedup
      let isDuplicate = false;
      if (isEligible && triggerKey) {
        isDuplicate = list.sendLogs.some((l) => l.subscriberId === sub.id && l.triggerKey === triggerKey);
      }

      subscribers.push({
        id: sub.id,
        name: sub.name,
        phone: sub.phone,
        triggerDate: fmtDate(triggerDate),
        isEligible,
        isDuplicate,
        wouldSend: isEligible && !isDuplicate,
        triggerKey: triggerKey || null,
        reason,
      });
    }

    results.push({
      listId: list.id,
      slug: list.slug,
      companyId: list.companyId,
      config: { channels, hasActiveMessage: !!activeMsg, activeMessageName: activeMsg?.name },
      subscribers,
    });
  }

  return NextResponse.json({
    mode: "dry",
    today: fmtDate(today),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    results,
  });
}

// ─── FORCE MODE ─────────────────────────────────────────────
// Bypasses date logic entirely. Finds subscriber by phone, dispatches Inngest event.

async function handleForceMode(slug: string, rawPhone: string | null) {
  if (!rawPhone) {
    return NextResponse.json({ error: "phone param required for force mode" }, { status: 400 });
  }

  const phones = phoneVariants(rawPhone);

  const list = await prisma.nurtureList.findFirst({
    where: { slug, isEnabled: true },
    include: {
      subscribers: { where: { phone: { in: phones }, phoneActive: true } },
    },
  });

  if (!list) {
    return NextResponse.json({ error: `No enabled "${slug}" list found` }, { status: 404 });
  }

  const sub = list.subscribers[0];
  if (!sub) {
    return NextResponse.json({
      error: `No active subscriber with phone ${rawPhone} in "${slug}" list`,
      hint: "Add a subscriber with this phone number and make sure phoneActive is true",
    }, { status: 404 });
  }

  const config = (list.configJson as any) || {};
  const channels = config.channels || {};
  if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud) {
    return NextResponse.json({ error: "No channels enabled on this list" }, { status: 400 });
  }

  const activeMsg = getActiveMessage(migrateConfigMessages(config));
  if (!activeMsg) {
    return NextResponse.json({ error: "No active message configured on this list" }, { status: 400 });
  }

  // Use a test trigger key
  const triggerKey = `test-${slug}-${Date.now()}`;

  // Create send log
  await prisma.nurtureSendLog.create({
    data: {
      subscriberId: sub.id,
      nurtureListId: list.id,
      triggerKey,
      status: "DISPATCHED",
    },
  });

  // Dispatch Inngest event
  const { inngest } = await import("@/lib/inngest/client");
  await inngest.send({
    name: "nurture/send-campaign-message",
    data: {
      companyId: list.companyId,
      subscriberId: sub.id,
      nurtureListId: list.id,
      subscriberPhone: sub.phone!,
      subscriberName: sub.name,
      channels,
      smsBody: activeMsg.smsBody || "",
      whatsappGreenBody: activeMsg.whatsappGreenBody || "",
      whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
      whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
      slug,
    },
  });

  log.info("Force-sent nurture test", { slug, phone: sub.phone, triggerKey });

  return NextResponse.json({
    mode: "force",
    sent: true,
    subscriber: { id: sub.id, name: sub.name, phone: sub.phone },
    triggerKey,
    channels,
    message: activeMsg.name,
    note: "Check your phone. Inngest will process the event and update send log status to SENT or FAILED.",
  });
}

// ─── LIVE MODE ──────────────────────────────────────────────
// Runs the actual processDateBasedNurtureTriggers (same as the cron job).

async function handleLiveMode(slug: string) {
  const { processDateBasedNurtureTriggers } = await import("@/app/actions/nurture-triggers");

  const companies = await prisma.nurtureList.findMany({
    where: { isEnabled: true, slug },
    select: { companyId: true },
    distinct: ["companyId"],
  });

  const results: any[] = [];

  for (const { companyId } of companies) {
    const result = await processDateBasedNurtureTriggers(companyId);

    const recentLogs = await prisma.nurtureSendLog.findMany({
      where: {
        nurtureList: { companyId, slug },
        sentAt: { gte: new Date(Date.now() - 60_000) },
      },
      include: {
        subscriber: { select: { name: true, phone: true } },
        nurtureList: { select: { slug: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    results.push({
      companyId,
      ...result,
      recentSendLogs: recentLogs.map((l) => ({
        subscriberName: l.subscriber.name,
        subscriberPhone: l.subscriber.phone,
        slug: l.nurtureList.slug,
        triggerKey: l.triggerKey,
        status: l.status,
        sentAt: l.sentAt.toISOString(),
      })),
    });
  }

  return NextResponse.json({ mode: "live", results });
}

// ─── CLEANUP MODE ───────────────────────────────────────────
// Deletes send logs for a subscriber so you can re-test (including dedup).

async function handleCleanupMode(slug: string, rawPhone: string | null) {
  if (!rawPhone) {
    return NextResponse.json({ error: "phone param required for cleanup mode" }, { status: 400 });
  }

  const phones = phoneVariants(rawPhone);

  const list = await prisma.nurtureList.findFirst({
    where: { slug },
    include: {
      subscribers: { where: { phone: { in: phones } } },
    },
  });

  if (!list || list.subscribers.length === 0) {
    return NextResponse.json({ error: `No subscriber with phone ${rawPhone} in "${slug}" list` }, { status: 404 });
  }

  const subIds = list.subscribers.map((s) => s.id);

  const deleted = await prisma.nurtureSendLog.deleteMany({
    where: {
      subscriberId: { in: subIds },
      nurtureListId: list.id,
    },
  });

  return NextResponse.json({
    mode: "cleanup",
    deletedLogs: deleted.count,
    subscriber: list.subscribers.map((s) => ({ id: s.id, name: s.name, phone: s.phone })),
    note: "Send logs cleared. You can now re-test force mode.",
  });
}
