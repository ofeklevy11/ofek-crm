import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { registerSchema } from "@/lib/validations/user";
import { createLogger } from "@/lib/logger";
import { logSecurityEvent, SEC_REGISTER } from "@/lib/security/audit-security";

const log = createLogger("AuthRegister");

const BCRYPT_ROUNDS = 12;
const MAX_BODY_SIZE = 4096; // 4KB

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9]+/g, "-") // Support Hebrew characters
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
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

    // Use a transaction to ensure atomicity - both company and user are created together
    const result = await prisma.$transaction(async (tx) => {
      // Create new company
      const slug = generateSlug(companyName);

      // Check if slug already exists and make it unique if needed
      let finalSlug = slug;
      let counter = 1;
      while (await tx.company.findUnique({ where: { slug: finalSlug } })) {
        finalSlug = `${slug}-${counter}`;
        counter++;
      }

      const company = await tx.company.create({
        data: {
          name: companyName,
          slug: finalSlug,
        },
      });

      // Create user with the new company ID
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          companyId: company.id,
          role: "admin", // First user in a new company is always admin
        },
      });

      return { user, company };
    });

    // Create session cookie
    const token = signUserId(result.user.id);
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 86_400, // 1 day sliding window (refreshed by middleware)
      path: "/",
      sameSite: "lax",
    });

    log.info("Company and user created", { companyId: result.company.id, userId: result.user.id });
    logSecurityEvent({ action: SEC_REGISTER, companyId: result.company.id, userId: result.user.id, ip, userAgent: req.headers.get("user-agent") ?? undefined });

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      },
      company: { id: result.company.id, name: result.company.name },
    });
  } catch (error) {
    log.error("Registration error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}
