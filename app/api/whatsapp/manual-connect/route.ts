import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { encrypt } from "@/lib/services/encryption";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { manualConnectSchema } from "@/lib/whatsapp/validation";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("WhatsAppManualConnect");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * POST — Manual WhatsApp connect.
 * Receives WABA ID + Access Token directly, validates them against the Graph API,
 * and stores the WABA details.
 */
async function handlePOST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasUserFlag(user, "canManageWhatsApp")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimited = await checkRateLimit(
    String(user.id),
    RATE_LIMITS.whatsappMutate,
  );
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = manualConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { wabaId, accessToken } = parsed.data;

  try {
    // Validate token + WABA ID by fetching WABA details
    const wabaRes = await fetch(
      `${GRAPH_API_BASE}/${wabaId}?fields=name,id`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!wabaRes.ok) {
      const err = await wabaRes.text().catch(() => "");
      log.error("WABA validation failed", {
        status: wabaRes.status,
        body: err.slice(0, 200),
      });
      return NextResponse.json(
        { error: "Invalid WABA ID or Access Token" },
        { status: 400 },
      );
    }

    const wabaData = await wabaRes.json();

    // Encrypt the access token
    const encrypted = encrypt(accessToken);
    const webhookVerifyToken = randomBytes(32).toString("hex");

    // Upsert WhatsApp account (appId: null for manual connect)
    const account = await prisma.whatsAppAccount.upsert({
      where: {
        companyId_wabaId: {
          companyId: user.companyId,
          wabaId,
        },
      },
      create: {
        companyId: user.companyId,
        wabaId,
        appId: null,
        businessName: wabaData.name || null,
        accessTokenEnc: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.authTag,
        webhookVerifyToken,
        status: "ACTIVE",
        connectedBy: user.id,
      },
      update: {
        accessTokenEnc: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.authTag,
        businessName: wabaData.name || undefined,
        status: "ACTIVE",
      },
    });

    // Fetch phone numbers for this WABA
    const phonesRes = await fetch(
      `${GRAPH_API_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (phonesRes.ok) {
      const phonesData = await phonesRes.json();
      const phones = phonesData.data || [];

      for (const phone of phones) {
        await prisma.whatsAppPhoneNumber.upsert({
          where: { phoneNumberId: phone.id },
          create: {
            companyId: user.companyId,
            accountId: account.id,
            phoneNumberId: phone.id,
            displayPhone: phone.display_phone_number || phone.id,
            verifiedName: phone.verified_name || null,
            qualityRating: phone.quality_rating || null,
          },
          update: {
            displayPhone: phone.display_phone_number || undefined,
            verifiedName: phone.verified_name || undefined,
            qualityRating: phone.quality_rating || undefined,
            isActive: true,
          },
        });
      }
    }

    // Subscribe to webhooks
    try {
      await fetch(`${GRAPH_API_BASE}/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      log.info("Webhook subscription created", { wabaId });
    } catch (err) {
      log.error("Failed to subscribe webhooks", {
        wabaId,
        error: String(err),
      });
    }

    return NextResponse.json({
      success: true,
      accounts: [
        {
          accountId: account.id,
          wabaId,
          businessName: wabaData.name || null,
        },
      ],
    });
  } catch (error) {
    log.error("Manual connect error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to complete WhatsApp setup" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics("/api/whatsapp/manual-connect", handlePOST);
