"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function getCurrentAuthUser() {
  try {
    // This is a placeholder for authentication
    // You should implement proper authentication based on your system
    const cookieStore = await cookies();
    const userEmail = cookieStore.get("user_email")?.value;

    if (!userEmail) {
      return { success: false, error: "Not authenticated" };
    }

    const user = await prisma.user.findUnique({
      where: {
        email: userEmail,
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
