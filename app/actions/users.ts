"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCompanyId } from "@/lib/company";
import { createAuditLog } from "@/lib/audit";
import { invalidateUserCache } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";

export async function getUsers() {
  try {
    const companyId = await requireCompanyId();
    const users = await withRetry(() =>
      prisma.user.findMany({
        where: { companyId },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    );
    return { success: true, data: users };
  } catch (error) {
    console.error("Error fetching users:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

export async function getUserById(id: number) {
  try {
    const companyId = await requireCompanyId();
    const user = await withRetry(() =>
      prisma.user.findFirst({
        where: { id, companyId },
      })
    );

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
    const user = await withRetry(() =>
      prisma.user.findFirst({
        where: { email, companyId },
      })
    );

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

    // CRITICAL: Verify user belongs to same company, update, and audit in one transaction
    const result = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findFirst({
          where: { id, companyId },
        });

        if (!existingUser) {
          return { success: false as const, error: "User not found or access denied" };
        }

        const user = await tx.user.update({
          where: { id, companyId },
          data: data as any, // Cast to any to avoid Prisma Json type mismatch
        });

        await createAuditLog(
          null,
          existingUser.id,
          `USER_UPDATE: ${existingUser.email}`,
          {
            updatedUserId: id,
            changes: data,
          },
          tx,
          companyId,
        );

        return { success: true as const, data: user };
      }, { maxWait: 5000, timeout: 10000 })
    );

    if (!result.success) {
      return result;
    }

    // Invalidate cached session so permission changes take effect immediately
    await invalidateUserCache(id);

    revalidatePath("/users");
    revalidatePath("/");

    return result;
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Failed to update user" };
  }
}

export async function deleteUser(id: number) {
  try {
    const companyId = await requireCompanyId();
    // Verify, delete, and audit in one transaction
    const result = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: { id, companyId },
        });

        if (!user) {
          return { success: false as const, error: "User not found or access denied" };
        }

        await tx.user.delete({
          where: { id, companyId },
        });

        await createAuditLog(null, null, `USER_DELETE: ${user.email}`, {
          deletedUserId: id,
        }, tx, companyId);

        return { success: true as const };
      }, { maxWait: 5000, timeout: 10000 })
    );

    if (!result.success) {
      return result;
    }

    revalidatePath("/users");
    revalidatePath("/");

    return result;
  } catch (error) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}
