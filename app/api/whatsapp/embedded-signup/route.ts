import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { encrypt } from "@/lib/services/encryption";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { embeddedSignupSchema } from "@/lib/whatsapp/validation";

const log = createLogger("WhatsAppEmbeddedSignup");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * POST — Complete Embedded Signup flow.
 * Receives the authorization code from the frontend after Facebook Login,
 * exchanges it for a token, and stores the WABA details.
 */
export async function POST(req: NextRequest) {
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
  const parsed = embeddedSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { code } = parsed.data;
  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appId || !appSecret) {
    log.error("WHATSAPP_APP_ID or WHATSAPP_APP_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  try {
    // Step 1: Exchange code for access token
    const tokenUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString(), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => "");
      log.error("Token exchange failed", {
        status: tokenRes.status,
        body: err.slice(0, 200),
      });
      return NextResponse.json(
        { error: "Failed to exchange authorization code" },
        { status: 400 },
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token received" },
        { status: 400 },
      );
    }

    // Step 2: Debug token to get WABA info and scopes
    const debugUrl = new URL(`${GRAPH_API_BASE}/debug_token`);
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", accessToken);

    const debugRes = await fetch(debugUrl.toString(), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!debugRes.ok) {
      log.error("Debug token failed", { status: debugRes.status });
      return NextResponse.json(
        { error: "Failed to verify access token" },
        { status: 400 },
      );
    }

    const debugData = await debugRes.json();
    const granularScopes = debugData.data?.granular_scopes || [];

    // Extract WABA IDs from scopes
    const wabaScope = granularScopes.find(
      (s: { scope: string }) => s.scope === "whatsapp_business_management",
    );
    const wabaIds: string[] = wabaScope?.target_ids || [];

    if (!wabaIds.length) {
      return NextResponse.json(
        { error: "No WhatsApp Business Account found in authorization" },
        { status: 400 },
      );
    }

    // Step 3: For each WABA, fetch phone numbers and store
    const results: { accountId: number; wabaId: string; businessName: string | null }[] = [];
    for (const wabaId of wabaIds) {
      // Get WABA details
      const wabaRes = await fetch(
        `${GRAPH_API_BASE}/${wabaId}?fields=name,id`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const wabaData = wabaRes.ok ? await wabaRes.json() : { id: wabaId };

      // Encrypt the access token
      const encrypted = encrypt(accessToken);
      const webhookVerifyToken = randomBytes(32).toString("hex");

      // Upsert WhatsApp account
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
          appId,
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

      // Subscribe to webhooks for this WABA
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

      results.push({
        accountId: account.id,
        wabaId,
        businessName: wabaData.name || null,
      });
    }

    return NextResponse.json({ success: true, accounts: results });
  } catch (error) {
    log.error("Embedded signup error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to complete WhatsApp setup" },
      { status: 500 },
    );
  }
}
