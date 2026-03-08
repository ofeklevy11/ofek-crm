import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { redis } from "@/lib/redis";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { registerSchema } from "@/lib/validations/user";
import { createLogger } from "@/lib/logger";
import { sendVerificationEmail } from "@/lib/email";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AuthRegister");

const BCRYPT_ROUNDS = 12;
const MAX_BODY_SIZE = 4096; // 4KB
const PENDING_REG_TTL = 3600; // 1 hour

async function handlePOST(req: Request) {
  try {
    const ip = getClientIp(req);

    // Rate limiting (before body parsing)
    const rateLimitResponse = await checkRateLimit(ip, RATE_LIMITS.register);
    if (rateLimitResponse) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות הרשמה. נסה שוב בעוד 15 דקות." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    // Body size limit
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    let raw;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Zod validation
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      return NextResponse.json(
        { error: firstError || "אנא מלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    const { name, email, password, companyName, isNewCompany } = parsed.data;

    // Force new company creation if isNewCompany is true
    if (!isNewCompany) {
      return NextResponse.json(
        { error: "הצטרפות לארגון קיים אינה נתמכת כרגע" },
        { status: 400 }
      );
    }

    // Check if user already exists — generic error to prevent email enumeration
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Artificial delay matching login pattern to prevent timing-based enumeration
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 500)
      );
      return NextResponse.json(
        { error: "לא ניתן ליצור חשבון עם הפרטים שהוזנו" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate 6-digit OTP code
    const code = String(crypto.randomInt(100000, 999999));

    // Store pending registration in Redis with 1h TTL
    const redisKey = `pending-reg:${email.toLowerCase()}`;
    await redis.set(
      redisKey,
      JSON.stringify({ code, name, passwordHash, companyName, isNewCompany }),
      "EX",
      PENDING_REG_TTL
    );

    // Send verification email
    await sendVerificationEmail(email, code);

    log.info("Verification code sent", { email });

    return NextResponse.json({ success: true, requiresVerification: true });
  } catch (error) {
    log.error("Registration error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}

export const POST = withMetrics("/api/auth/register", handlePOST);
