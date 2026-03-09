import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import {
  validateOAuthState,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  encryptToken,
} from "@/lib/services/google-drive";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveCallback");

function redirectWithParam(param: string): NextResponse {
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/files?source=drive&${param}`);
}

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      log.error("Google OAuth error", { error });
      return redirectWithParam("driveError=access_denied");
    }

    if (!code || !state) {
      return redirectWithParam("driveError=missing_params");
    }

    // Validate HMAC state
    const stateData = validateOAuthState(state);
    if (!stateData) {
      return redirectWithParam("driveError=invalid_state");
    }

    // Verify current user matches state
    const user = await getCurrentUser();
    if (
      !user ||
      user.id !== stateData.userId ||
      user.companyId !== stateData.companyId
    ) {
      return redirectWithParam("driveError=user_mismatch");
    }

    // Rate limit per user
    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleDriveOAuth,
    );
    if (rl) return rl;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return redirectWithParam("driveError=no_refresh_token");
    }

    // Get Google user info
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    // Encrypt tokens
    const encAccess = encryptToken(tokens.access_token);
    const encRefresh = encryptToken(tokens.refresh_token);

    // Upsert connection
    await prisma.googleDriveConnection.upsert({
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

    return redirectWithParam("driveConnected=true");
  } catch (error) {
    log.error("OAuth callback failed", { error: String(error) });
    return redirectWithParam("driveError=callback_failed");
  }
}

export const GET = withMetrics(
  "/api/integrations/google/drive/callback",
  handleGET,
);
