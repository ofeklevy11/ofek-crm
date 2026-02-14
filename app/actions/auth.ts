"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function getCurrentAuthUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

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
