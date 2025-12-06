"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createViewFolder(name: string) {
  try {
    const folder = await prisma.viewFolder.create({
      data: { name },
    });
    revalidatePath("/analytics");
    return { success: true, data: folder };
  } catch (error) {
    console.error("Failed to create folder:", error);
    return { success: false, error: "Failed to create folder" };
  }
}

export async function getViewFolders() {
  try {
    const folders = await prisma.viewFolder.findMany({
      orderBy: { order: "asc" },
    });
    return { success: true, data: folders };
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    return { success: false, error: "Failed to fetch folders" };
  }
}

export async function deleteViewFolder(id: number) {
  try {
    // Manually unset folderId for items inside the folder before deleting
    await prisma.$transaction([
      prisma.analyticsView.updateMany({
        where: { folderId: id },
        data: { folderId: null },
      }),
      prisma.automationRule.updateMany({
        where: { folderId: id },
        data: { folderId: null },
      }),
      prisma.viewFolder.delete({
        where: { id },
      }),
    ]);

    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return { success: false, error: "Failed to delete folder" };
  }
}

export async function moveViewToFolder(
  viewId: number,
  type: "CUSTOM" | "AUTOMATION",
  folderId: number | null
) {
  try {
    if (type === "CUSTOM") {
      await prisma.analyticsView.update({
        where: { id: viewId },
        data: { folderId },
      });
    } else {
      await prisma.automationRule.update({
        where: { id: viewId },
        data: { folderId },
      });
    }
    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    console.error("Failed to move view:", error);
    return { success: false, error: "Failed to move view" };
  }
}
