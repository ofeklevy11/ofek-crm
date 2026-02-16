"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { patchUserSchema } from "@/lib/validations/user";
import { isPrismaError } from "@/lib/prisma-error";
import { createLogger } from "@/lib/logger";

const log = createLogger("Users");

export async function getUsers() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    const rateLimited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.api).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const users = await withRetry(() =>
      prisma.user.findMany({
        where: { companyId: currentUser.companyId },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    );
    return { success: true, data: users };
  } catch (error) {
    log.error("Error fetching users", { error: String(error) });
    return { success: false, error: "Failed to fetch users" };
  }
}

export async function getUserById(id: number) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    const rateLimited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.api).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const user = await withRetry(() =>
      prisma.user.findFirst({
        where: { id, companyId: currentUser.companyId },
        select: { id: true, name: true, email: true, role: true },
      })
    );

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    log.error("Error fetching user", { error: String(error) });
    return { success: false, error: "Failed to fetch user" };
  }
}

export async function updateUser(
  id: number,
  data: Record<string, unknown>
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    if (currentUser.role !== "admin") {
      return { success: false, error: "Only admins can update users" };
    }

    const rateLimited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.userManagement).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const parsed = patchUserSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
      return { success: false, error: "Invalid user ID" };
    }

    const validatedData = parsed.data;

    const result = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findFirst({
          where: { id, companyId: currentUser.companyId },
        });

        if (!existingUser) {
          return { success: false as const, error: "User not found or access denied" };
        }

        const user = await tx.user.update({
          where: { id, companyId: currentUser.companyId },
          data: validatedData,
          select: { id: true, name: true, email: true, role: true },
        });

        await createAuditLog(
          null,
          currentUser.id,
          `USER_UPDATE: ${existingUser.email}`,
          {
            updatedUserId: id,
            changes: Object.keys(validatedData),
          },
          tx,
          currentUser.companyId,
        );

        return { success: true as const, data: user };
      }, { maxWait: 5000, timeout: 10000 })
    );

    if (!result.success) {
      return result;
    }

    await invalidateUserCache(id);

    revalidatePath("/users");
    revalidatePath("/");

    return result;
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return { success: false, error: "User not found" };
    }
    if (isPrismaError(error, "P2002")) {
      return { success: false, error: "A user with this email already exists" };
    }
    log.error("Error updating user", { error: String(error) });
    return { success: false, error: "Failed to update user" };
  }
}

export async function deleteUser(id: number) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    if (currentUser.role !== "admin") {
      return { success: false, error: "Only admins can delete users" };
    }

    if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
      return { success: false, error: "Invalid user ID" };
    }

    if (currentUser.id === id) {
      return { success: false, error: "Cannot delete yourself" };
    }

    const rateLimited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.userManagement).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const result = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: { id, companyId: currentUser.companyId },
        });

        if (!user) {
          return { success: false as const, error: "User not found or access denied" };
        }

        await tx.user.delete({
          where: { id, companyId: currentUser.companyId },
        });

        await createAuditLog(null, currentUser.id, `USER_DELETE: ${user.email}`, {
          deletedUserId: id,
        }, tx, currentUser.companyId);

        return { success: true as const };
      }, { maxWait: 5000, timeout: 10000 })
    );

    if (!result.success) {
      return result;
    }

    await invalidateUserCache(id);

    revalidatePath("/users");
    revalidatePath("/");

    return result;
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return { success: false, error: "User not found" };
    }
    log.error("Error deleting user", { error: String(error) });
    return { success: false, error: "Failed to delete user" };
  }
}
