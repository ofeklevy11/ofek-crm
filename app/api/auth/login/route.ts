import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";
import { logSecurityEvent, SEC_LOGIN_SUCCESS, SEC_LOGIN_FAILED } from "@/lib/security/audit-security";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AuthLogin");

const BCRYPT_ROUNDS = 12;
const MAX_BODY_SIZE = 2048; // 2KB

async function handlePOST(req: Request) {
  try {
    const ip = getClientIp(req);

    // IP-based rate limiting
    const rateLimitResponse = await checkRateLimit(ip, RATE_LIMITS.login);
    if (rateLimitResponse) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    // Body size limit
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "אנא  מלא את כל השדות" },
        { status: 400 }
      );
    }

    // Field length validation
    if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 128) {
      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Per-account rate limiting (keyed by email)
    const accountRateLimitResponse = await checkRateLimit(normalizedEmail, RATE_LIMITS.loginAccount);
    if (accountRateLimitResponse) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות כושלים לחשבון זה. נסה שוב מאוחר יותר." },
        { status: 429, headers: { "Retry-After": "1800" } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      log.warn("Login failed - user not found", { email: normalizedEmail, ip });
      // Artificial Delay to prevent username enumeration and slow down brute force
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 500)
      );
      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      logSecurityEvent({ action: SEC_LOGIN_FAILED, companyId: user.companyId, userId: user.id, ip, userAgent: req.headers.get("user-agent") ?? undefined });
      // Artificial Delay
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 500)
      );

      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Transparent bcrypt rehash: upgrade to higher rounds if needed
    const currentRounds = parseInt(user.passwordHash.split("$")[2] || "0", 10);
    if (currentRounds < BCRYPT_ROUNDS) {
      const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      }).catch((err) => log.warn("Rehash failed", { userId: user.id, error: String(err) }));
    }

    // Create session cookie
    const token = signUserId(user.id);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 86_400, // 1 day sliding window (refreshed by middleware)
      path: "/",
      sameSite: "lax",
    });

    logSecurityEvent({ action: SEC_LOGIN_SUCCESS, companyId: user.companyId, userId: user.id, ip, userAgent: req.headers.get("user-agent") ?? undefined });

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    log.error("Login error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}

export const POST = withMetrics("/api/auth/login", handlePOST);
