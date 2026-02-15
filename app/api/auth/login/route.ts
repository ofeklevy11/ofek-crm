import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Redis-based rate limiting — survives serverless cold starts
    const rateLimitResponse = await checkRateLimit(ip, RATE_LIMITS.login);
    if (rateLimitResponse) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "אנא  מלא את כל השדות" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
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
      // Artificial Delay
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 500)
      );

      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Create session cookie
    const token = signUserId(user.id);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}
