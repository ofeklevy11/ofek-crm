"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getCategories() {
  try {
    const categories = await prisma.tableCategory.findMany({
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
    if (!name) {
      return { success: false, error: "Name is required" };
    }

    const category = await prisma.tableCategory.create({
      data: { name },
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
    if (!name) {
      return { success: false, error: "Name is required" };
    }

    const category = await prisma.tableCategory.update({
      where: { id },
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
    await prisma.tableCategory.delete({
      where: { id },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true };
  } catch (error) {
    console.error("Error deleting category:", error);
    return { success: false, error: "Failed to delete category" };
  }
}
