import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";

const RATE_LIMIT_MAP = new Map<
  string,
  { count: number; lastAttempt: number }
>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 דקות

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    // Rate Limiting Logic (IP-based workaround)
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    const record = RATE_LIMIT_MAP.get(ip);

    if (record) {
      if (now - record.lastAttempt > BLOCK_DURATION) {
        // Reset if block expired
        RATE_LIMIT_MAP.delete(ip);
      } else if (record.count >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות." },
          { status: 429 }
        );
      }
    }

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
      // Record failed attempt
      const current = RATE_LIMIT_MAP.get(ip) || { count: 0, lastAttempt: now };
      RATE_LIMIT_MAP.set(ip, { count: current.count + 1, lastAttempt: now });

      // Artificial Delay
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 500)
      );

      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Success - Reset Rate Limit
    RATE_LIMIT_MAP.delete(ip);

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
