"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";

export async function getCategories() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const categories = await prisma.tableCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "asc" },
      include: {
        tables: {
          select: { id: true },
        },
      },
    });
    return { success: true, data: categories };
  } catch (error) {
    console.error("Error fetching categories:", error);
    return { success: false, error: "Failed to fetch categories" };
  }
}

export async function createCategory(name: string) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "Unauthorized" };
    }

    if (!name) {
      return { success: false, error: "Name is required" };
    }

    const category = await prisma.tableCategory.create({
      data: {
        name,
        companyId: user.companyId,
      },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: category };
  } catch (error) {
    console.error("Error creating category:", error);
    return { success: false, error: "Failed to create category" };
  }
}

export async function updateCategory(id: number, name: string) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "Unauthorized" };
    }

    if (!name) {
      return { success: false, error: "Name is required" };
    }

    // Ensure category belongs to company
    const category = await prisma.tableCategory.update({
      where: { id, companyId: user.companyId },
      data: { name },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: category };
  } catch (error) {
    console.error("Error updating category:", error);
    return { success: false, error: "Failed to update category" };
  }
}

export async function deleteCategory(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.tableCategory.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true };
  } catch (error) {
    console.error("Error deleting category:", error);
    return { success: false, error: "Failed to delete category" };
  }
}

export async function convertUncategorizedToCategory(name: string) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "Unauthorized" };
    }

    if (!name) {
      return { success: false, error: "Name is required" };
    }

    // 1. Create the new category
    const category = await prisma.tableCategory.create({
      data: {
        name,
        companyId: user.companyId,
      },
    });

    // 2. Update all uncategorized tables belonging to THIS company
    await prisma.tableMeta.updateMany({
      where: {
        companyId: user.companyId,
        categoryId: null,
      },
      data: { categoryId: category.id },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: category };
  } catch (error) {
    console.error("Error converting uncategorized:", error);
    return { success: false, error: "Failed to convert uncategorized tables" };
  }
}
