import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sendPasswordResetEmail } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("ForgotPassword");

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

async function handlePOST(req: Request) {
  try {
    const ip = getClientIp(req);

    const ipRl = await checkRateLimit(ip, RATE_LIMITS.forgotPassword);
    if (ipRl) return ipRl;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "כתובת אימייל לא תקינה" }, { status: 400 });
    }
    const { email } = parsed.data;

    // Per-account rate limit
    const acctRl = await checkRateLimit(email, RATE_LIMITS.forgotPasswordAccount);
    if (acctRl) return acctRl;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      // Artificial delay to prevent timing-based enumeration
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
      return NextResponse.json({ success: true });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const redisKey = `pwd-reset:${email}`;

    await redis.set(
      redisKey,
      JSON.stringify({ code, userId: user.id, attempts: 0 }),
      "EX",
      900 // 15 minutes
    );

    await sendPasswordResetEmail(email, code);

    log.info("Password reset OTP sent", { email });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Forgot password error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}

export const POST = withMetrics("/api/auth/forgot-password", handlePOST);
