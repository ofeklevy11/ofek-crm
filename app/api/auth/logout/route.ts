import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyUserId } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/session";
import { invalidateUserCache } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent, SEC_LOGOUT } from "@/lib/security/audit-security";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { withMetrics } from "@/lib/with-metrics";

async function handlePOST(req: Request) {
  const rl = await checkRateLimit(getClientIp(req), RATE_LIMITS.api);
  if (rl) return rl;
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (token) {
    const userId = verifyUserId(token);
    if (userId) {
      // Revoke all sessions so captured tokens can't be reused
      await revokeUserSessions(userId);
      // Clear cached user data
      await invalidateUserCache(userId);
      // Log security event (fire-and-forget)
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
      if (user) {
        logSecurityEvent({ action: SEC_LOGOUT, companyId: user.companyId, userId });
      }
    }
  }

  cookieStore.delete("auth_token");
  return NextResponse.json({ success: true });
}

export const POST = withMetrics("/api/auth/logout", handlePOST);
