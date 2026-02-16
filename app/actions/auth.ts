"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { isTokenIssuedAtValid } from "@/lib/session";
import { createLogger } from "@/lib/logger";

const log = createLogger("AuthAction");

export async function getCurrentAuthUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const { verifyUserIdWithMeta } = await import("@/lib/auth");
    const meta = verifyUserIdWithMeta(token);

    if (!meta) {
      return { success: false, error: "Invalid token" };
    }

    // Check if token has been revoked (e.g. after logout or password change)
    const isValid = await isTokenIssuedAtValid(meta.userId, meta.issuedAt);
    if (!isValid) {
      return { success: false, error: "Session expired" };
    }

    const user = await prisma.user.findUnique({
      where: { id: meta.userId },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        allowedWriteTableIds: true,
        tablePermissions: true,
        isPremium: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    log.error("Error fetching current auth user", { error: String(error) });
    return { success: false, error: "Failed to fetch current user" };
  }
}
