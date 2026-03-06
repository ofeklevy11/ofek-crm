import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { tokensMatch } from "@/lib/security/tokens";
import { createLogger } from "@/lib/logger";
import { logSecurityEvent, SEC_REGISTER } from "@/lib/security/audit-security";

const log = createLogger("AuthVerifyEmail");

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);

    const rateLimitResponse = await checkRateLimit(ip, RATE_LIMITS.verifyEmail);
    if (rateLimitResponse) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות אימות. נסה שוב בעוד 15 דקות." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    let body: { email?: string; code?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email, code } = body;
    if (!email || !code || typeof email !== "string" || typeof code !== "string") {
      return NextResponse.json({ error: "חסרים שדות נדרשים" }, { status: 400 });
    }

    const redisKey = `pending-reg:${email.toLowerCase()}`;
    const raw = await redis.get(redisKey);

    if (!raw) {
      return NextResponse.json(
        { error: "קוד האימות פג תוקף או שלא נמצאה בקשת הרשמה. נסה להירשם מחדש." },
        { status: 400 }
      );
    }

    const pending = JSON.parse(raw) as {
      code: string;
      name: string;
      passwordHash: string;
      companyName: string;
      isNewCompany: boolean;
    };

    if (!tokensMatch(code, pending.code)) {
      return NextResponse.json({ error: "קוד אימות שגוי" }, { status: 400 });
    }

    // Code is valid — create user + company
    const result = await prisma.$transaction(async (tx) => {
      // Check if user was created in the meantime
      const existing = await tx.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        throw new Error("USER_EXISTS");
      }

      const slug = generateSlug(pending.companyName);
      let finalSlug = slug;
      let counter = 1;
      while (await tx.company.findUnique({ where: { slug: finalSlug } })) {
        finalSlug = `${slug}-${counter}`;
        counter++;
      }

      const company = await tx.company.create({
        data: { name: pending.companyName, slug: finalSlug },
      });

      const user = await tx.user.create({
        data: {
          name: pending.name,
          email: email.toLowerCase(),
          passwordHash: pending.passwordHash,
          companyId: company.id,
          role: "admin",
        },
      });

      return { user, company };
    });

    // Delete pending registration
    await redis.del(redisKey);

    // Create session cookie
    const token = signUserId(result.user.id);
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 86_400,
      path: "/",
      sameSite: "lax",
    });

    log.info("Email verified, user created", { companyId: result.company.id, userId: result.user.id });
    logSecurityEvent({ action: SEC_REGISTER, companyId: result.company.id, userId: result.user.id, ip, userAgent: req.headers.get("user-agent") ?? undefined });

    return NextResponse.json({
      success: true,
      user: { id: result.user.id, name: result.user.name, role: result.user.role },
      company: { id: result.company.id, name: result.company.name },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_EXISTS") {
      return NextResponse.json(
        { error: "לא ניתן ליצור חשבון עם הפרטים שהוזנו" },
        { status: 400 }
      );
    }
    log.error("Verification error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}
