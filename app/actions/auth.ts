"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function getCurrentAuthUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      // Fallback for dev/legacy: check user_email if auth_token is missing
      const userEmail = cookieStore.get("user_email")?.value;
      if (userEmail) {
        const user = await prisma.user.findUnique({
          where: { email: userEmail },
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
        if (user) return { success: true, data: user };
      }
      return { success: false, error: "Not authenticated" };
    }

    // Import dynamically to avoid circular deps if any, or just use what permissions-server uses
    const { verifyUserId } = await import("@/lib/auth");
    const userId = verifyUserId(token);

    if (!userId) {
      return { success: false, error: "Invalid token" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
    console.error("Error fetching current auth user:", error);
    return { success: false, error: "Failed to fetch current user" };
  }
}

export async function setAuthUser(email: string) {
  try {
    const cookieStore = await cookies();
    cookieStore.set("user_email", email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return { success: true };
  } catch (error) {
    console.error("Error setting auth user:", error);
    return { success: false, error: "Failed to set auth user" };
  }
}
