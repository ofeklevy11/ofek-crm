import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
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
      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Verify password
    // Note: If some users have plain text passwords (legacy), we might need to handle that,
    // but the request asks for bcrypt specifically, so we assume bcrypt is used or we start using it.
    // If users in DB currently have "password123" stored as plain text, this will fail.
    // However, the prompt says "password will be encrypted with bcrypt", implying I should enforce it.
    // I won't auto-migrate plain text to bcrypt on login unless asked, to keep it simple as requested.

    // We assume passwordHash in DB is a bcrypt hash.
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "אימייל או סיסמא שגויים" },
        { status: 401 }
      );
    }

    // Create session cookie
    const token = signUserId(user.id);

    // Set cookie
    // Note: In Next.js App Router API routes, we use cookies() from next/headers
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
