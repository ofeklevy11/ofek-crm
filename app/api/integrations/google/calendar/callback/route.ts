import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import {
  validateOAuthState,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  encryptToken,
} from "@/lib/services/google-calendar";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleCalCallback");

function redirectWithParam(param: string): NextResponse {
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/calendar?${param}`);
}

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      log.error("Google OAuth error", { error });
      return redirectWithParam("googleError=access_denied");
    }

    if (!code || !state) {
      return redirectWithParam("googleError=missing_params");
    }

    // Validate HMAC state
    const stateData = validateOAuthState(state);
    if (!stateData) {
      return redirectWithParam("googleError=invalid_state");
    }

    // Verify current user matches state
    const user = await getCurrentUser();
    if (!user || user.id !== stateData.userId || user.companyId !== stateData.companyId) {
      return redirectWithParam("googleError=user_mismatch");
    }

    // Rate limit per user
    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleCalOAuth,
    );
    if (rl) return rl;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return redirectWithParam("googleError=no_refresh_token");
    }

    // Get Google user info
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    // Encrypt tokens
    const encAccess = encryptToken(tokens.access_token);
    const encRefresh = encryptToken(tokens.refresh_token);

    // Upsert connection
    await prisma.googleCalendarConnection.upsert({
      where: {
        companyId_userId: {
          companyId: user.companyId,
          userId: user.id,
        },
      },
      create: {
        companyId: user.companyId,
        userId: user.id,
        googleEmail: googleUser.email,
        accessTokenEnc: encAccess.ciphertext,
        accessTokenIv: encAccess.iv,
        accessTokenTag: encAccess.authTag,
        refreshTokenEnc: encRefresh.ciphertext,
        refreshTokenIv: encRefresh.iv,
        refreshTokenTag: encRefresh.authTag,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
      },
      update: {
        googleEmail: googleUser.email,
        accessTokenEnc: encAccess.ciphertext,
        accessTokenIv: encAccess.iv,
        accessTokenTag: encAccess.authTag,
        refreshTokenEnc: encRefresh.ciphertext,
        refreshTokenIv: encRefresh.iv,
        refreshTokenTag: encRefresh.authTag,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
        isActive: true,
      },
    });

    return redirectWithParam("googleConnected=true");
  } catch (error) {
    log.error("OAuth callback failed", { error: String(error) });
    return redirectWithParam("googleError=callback_failed");
  }
}

export const GET = withMetrics(
  "/api/integrations/google/calendar/callback",
  handleGET,
);
