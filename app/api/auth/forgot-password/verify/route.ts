import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { tokensMatch } from "@/lib/security/tokens";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("ForgotPasswordVerify");

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
  code: z.string().length(6),
});

async function handlePOST(req: Request) {
  try {
    const ip = getClientIp(req);

    const rl = await checkRateLimit(ip, RATE_LIMITS.verifyEmail);
    if (rl) return rl;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    }
    const { email, code } = parsed.data;

    const redisKey = `pwd-reset:${email}`;
    const raw = await redis.get(redisKey);

    if (!raw) {
      return NextResponse.json(
        { error: "קוד האימות פג תוקף. נסה שוב." },
        { status: 400 }
      );
    }

    const pending = JSON.parse(raw) as {
      code: string;
      userId: number;
      attempts: number;
    };

    // Increment attempts
    pending.attempts += 1;

    if (pending.attempts > 5) {
      await redis.del(redisKey);
      return NextResponse.json(
        { error: "יותר מדי ניסיונות. נסה לבקש קוד חדש." },
        { status: 400 }
      );
    }

    // Save incremented attempts
    const ttl = await redis.ttl(redisKey);
    if (ttl > 0) {
      await redis.set(redisKey, JSON.stringify(pending), "EX", ttl);
    }

    if (!tokensMatch(code, pending.code)) {
      return NextResponse.json({ error: "קוד אימות שגוי" }, { status: 400 });
    }

    // Code is valid — generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    await redis.set(
      `pwd-reset-token:${resetToken}`,
      JSON.stringify({ userId: pending.userId, email }),
      "EX",
      600 // 10 minutes
    );

    // Delete OTP key
    await redis.del(redisKey);

    log.info("Password reset OTP verified", { email });
    return NextResponse.json({ success: true, resetToken });
  } catch (error) {
    log.error("Verify OTP error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}

export const POST = withMetrics("/api/auth/forgot-password/verify", handlePOST);
