"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";

export async function createViewFolder(name: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const folder = await prisma.viewFolder.create({
      data: {
        name,
        companyId: user.companyId,
      },
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
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const folders = await prisma.viewFolder.findMany({
      where: { companyId: user.companyId },
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
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Verify folder belongs to valid company first or use matching where clause in transaction
    const folder = await prisma.viewFolder.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!folder) return { success: false, error: "Unauthorized or not found" };

    // Manually unset folderId for items inside the folder before deleting
    // We filter updateMany/delete by companyId for safety although findFirst verified ownership essentially
    await prisma.$transaction([
      prisma.analyticsView.updateMany({
        where: { folderId: id, companyId: user.companyId },
        data: { folderId: null },
      }),
      prisma.automationRule.updateMany({
        where: { folderId: id, companyId: user.companyId },
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
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    if (type === "CUSTOM") {
      await prisma.analyticsView.update({
        where: { id: viewId, companyId: user.companyId },
        data: { folderId },
      });
    } else {
      await prisma.automationRule.update({
        where: { id: viewId, companyId: user.companyId },
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
