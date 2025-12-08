"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCompanyId } from "@/lib/company";

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
    const user = await prisma.user.update({
      where: { id },
      data,
    });

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

    revalidatePath("/users");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}
