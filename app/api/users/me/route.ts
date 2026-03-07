import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { revokeUserSessions } from "@/lib/session";
import { logSecurityEvent, SEC_ACCOUNT_DELETED } from "@/lib/security/audit-security";
import { createLogger } from "@/lib/logger";
import { cookies } from "next/headers";

const log = createLogger("DeleteAccount");

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.accountDelete);
    if (rl) return rl;

    let body: { password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { password } = body;
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "נדרשת סיסמה" }, { status: 400 });
    }

    // Verify password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, role: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    const valid = await bcrypt.compare(password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "סיסמה שגויה" }, { status: 400 });
    }

    // If admin, check if last admin
    if (dbUser.role === "admin") {
      const adminCount = await prisma.user.count({
        where: { companyId: user.companyId, role: "admin" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "אתה האדמין היחיד בארגון. העבר את תפקיד האדמין למשתמש אחר לפני מחיקת החשבון." },
          { status: 400 }
        );
      }
    }

    // Delete user
    await prisma.user.delete({
      where: { id: user.id },
    });

    // Cleanup
    await Promise.all([
      invalidateUserCache(user.id),
      revokeUserSessions(user.id),
    ]);

    // Delete auth cookie
    const cookieStore = await cookies();
    cookieStore.delete("auth_token");

    logSecurityEvent({
      action: SEC_ACCOUNT_DELETED,
      companyId: user.companyId,
      userId: user.id,
    });

    log.info("Account deleted", { userId: user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Delete account error", { error: String(error) });
    return NextResponse.json({ error: "שגיאה במחיקת החשבון" }, { status: 500 });
  }
}
