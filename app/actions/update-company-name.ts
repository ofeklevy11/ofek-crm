"use server";

import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { prisma as db } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function updateCompanyName(data: {
  newCompanyName: string;
  password: string;
}) {
  try {
    // Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "לא מאומת" };
    }

    // Check if user is admin
    if (currentUser.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים לשנות את שם הארגון" };
    }

    // Validate inputs
    if (!data.newCompanyName || data.newCompanyName.trim().length === 0) {
      return { success: false, error: "שם הארגון לא יכול להיות רק" };
    }

    if (!data.password || data.password.length === 0) {
      return { success: false, error: "נא להזין סיסמה" };
    }

    // Get user with password hash to verify password
    const userWithPassword = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { passwordHash: true, companyId: true },
    });

    if (!userWithPassword) {
      return { success: false, error: "משתמש לא נמצא" };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      userWithPassword.passwordHash,
    );

    if (!isPasswordValid) {
      return { success: false, error: "סיסמה שגויה" };
    }

    // Update company name
    await db.company.update({
      where: { id: userWithPassword.companyId },
      data: { name: data.newCompanyName.trim() },
    });

    // Invalidate cached user so the new company name is reflected immediately
    await invalidateUserCache(currentUser.id);

    return { success: true, message: "שם הארגון עודכן בהצלחה" };
  } catch (error) {
    console.error("Error updating company name:", error);
    return { success: false, error: "שגיאה בעדכון שם הארגון" };
  }
}
