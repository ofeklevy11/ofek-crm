import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { revokeUserSessions } from "@/lib/session";
import { invalidateUserCache } from "@/lib/permissions-server";
import { sendPasswordChangedEmail } from "@/lib/email";
import { logSecurityEvent, SEC_PASSWORD_RESET } from "@/lib/security/audit-security";
import { createLogger } from "@/lib/logger";

const log = createLogger("ForgotPasswordReset");

const schema = z.object({
  resetToken: z.string().length(64),
  password: z.string().min(10).max(128),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);

    const rl = await checkRateLimit(ip, RATE_LIMITS.forgotPassword);
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
    const { resetToken, password } = parsed.data;

    const tokenKey = `pwd-reset-token:${resetToken}`;
    const raw = await redis.get(tokenKey);

    if (!raw) {
      return NextResponse.json(
        { error: "הקישור לאיפוס סיסמה פג תוקף. נסה שוב." },
        { status: 400 }
      );
    }

    const { userId, email } = JSON.parse(raw) as {
      userId: number;
      email: string;
    };

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true, companyId: true, name: true, email: true },
    });

    // Cleanup and security in parallel
    await Promise.all([
      redis.del(tokenKey),
      revokeUserSessions(userId),
      invalidateUserCache(userId),
    ]);

    logSecurityEvent({
      action: SEC_PASSWORD_RESET,
      companyId: user.companyId,
      userId,
      ip,
      details: { method: "forgot-password" },
    });

    sendPasswordChangedEmail(user.email, user.name).catch(() => {});

    log.info("Password reset completed", { userId });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Password reset error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}
