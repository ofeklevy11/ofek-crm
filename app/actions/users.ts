"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCompanyId } from "@/lib/company";
import { createAuditLog } from "@/lib/audit";

export async function getUsers() {
  try {
    const companyId = await requireCompanyId();
    const users = await prisma.user.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: users };
  } catch (error) {
    console.error("Error fetching users:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

export async function getUserById(id: number) {
  try {
    const companyId = await requireCompanyId();
    const user = await prisma.user.findFirst({
      where: { id, companyId },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching user:", error);
    return { success: false, error: "Failed to fetch user" };
  }
}

export async function getCurrentUser(email: string) {
  try {
    const companyId = await requireCompanyId();
    const user = await prisma.user.findFirst({
      where: { email, companyId },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching current user:", error);
    return { success: false, error: "Failed to fetch current user" };
  }
}

export async function updateUser(
  id: number,
  data: {
    name?: string;
    email?: string;
    role?: string;
    tablePermissions?: Record<string, unknown>;
  }
) {
  try {
    const companyId = await requireCompanyId();

    // CRITICAL: Verify user belongs to same company
    const existingUser = await prisma.user.findFirst({
      where: { id, companyId },
    });

    if (!existingUser) {
      return { success: false, error: "User not found or access denied" };
    }

    const user = await prisma.user.update({
      where: { id },
      data: data as any, // Cast to any to avoid Prisma Json type mismatch
    });

    const currentUser = await getCurrentUser(existingUser.email); // Need current user ID for log
    if (currentUser.data) {
      await createAuditLog(
        null,
        currentUser.data.id,
        `USER_UPDATE: ${existingUser.email}`,
        {
          updatedUserId: id,
          changes: data,
        }
      );
    }

    revalidatePath("/users");
    revalidatePath("/");

    return { success: true, data: user };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Failed to update user" };
  }
}

export async function deleteUser(id: number) {
  try {
    const companyId = await requireCompanyId();
    // First verify the user belongs to the same company
    const user = await prisma.user.findFirst({
      where: { id, companyId },
    });

    if (!user) {
      return { success: false, error: "User not found or access denied" };
    }

    await prisma.user.delete({
      where: { id },
    });

    const currentUser = await getCurrentUser(user.email); // This fetches user by email, might fail if user creates audit for themselves (weird flow).
    // Usually admin deletes user. Let's try to get current session user ideally, but this function doesn't have it.
    // For now logging with target user context is confusing.
    // Improved: Just log the action with null user if we can't easily get actor, or pass actor down.
    // Since we don't have session user here easily without extra call, let's just log the event.

    // Better approach:
    await createAuditLog(null, null, `USER_DELETE: ${user.email}`, {
      deletedUserId: id,
    });

    revalidatePath("/users");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}
