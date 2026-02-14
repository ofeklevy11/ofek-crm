"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { validateViewFolderInCompany } from "@/lib/company-validation";

export type FolderType = "ANALYTICS" | "AUTOMATION";

export async function getFolders(type: FolderType) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const folders = await prisma.viewFolder.findMany({
      where: {
        companyId: user.companyId,
        type,
      },
      orderBy: { order: "asc" },
      take: 500,
      include: {
        _count: {
          select: {
            analyticsViews: type === "ANALYTICS",
            automationRules: type === "AUTOMATION",
          },
        },
      },
    });

    return { success: true, data: folders };
  } catch (error) {
    console.error("Error fetching folders:", error);
    return { success: false, error: "Failed to fetch folders" };
  }
}

export async function createFolder(name: string, type: FolderType) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const folder = await prisma.viewFolder.create({
      data: {
        companyId: user.companyId,
        name,
        type,
      },
    });

    revalidatePath(type === "AUTOMATION" ? "/automations" : "/analytics");
    return { success: true, data: folder };
  } catch (error) {
    console.error("Error creating folder:", error);
    return { success: false, error: "Failed to create folder" };
  }
}

export async function updateFolder(id: number, name: string) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const folder = await prisma.viewFolder.update({
      where: { id, companyId: user.companyId },
      data: { name },
    });

    revalidatePath(
      folder.type === "AUTOMATION" ? "/automations" : "/analytics"
    );
    return { success: true, data: folder };
  } catch (error) {
    console.error("Error updating folder:", error);
    return { success: false, error: "Failed to update folder" };
  }
}

export async function deleteFolder(id: number) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const folder = await prisma.viewFolder.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath(
      folder.type === "AUTOMATION" ? "/automations" : "/analytics"
    );
    return { success: true };
  } catch (error) {
    console.error("Error deleting folder:", error);
    return { success: false, error: "Failed to delete folder" };
  }
}

export async function moveItemToFolder(
  itemId: number,
  folderId: number | null,
  itemType: "AUTOMATION" | "ANALYTICS"
) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    // SECURITY: Validate target folderId belongs to same company
    if (folderId) {
      if (!(await validateViewFolderInCompany(folderId, user.companyId))) {
        return { success: false, error: "Invalid folder" };
      }
    }

    if (itemType === "AUTOMATION") {
      await prisma.automationRule.update({
        where: { id: itemId, companyId: user.companyId },
        data: { folderId },
      });
      revalidatePath("/automations");
    } else {
      // Analytics View
      await prisma.analyticsView.update({
        where: { id: itemId, companyId: user.companyId },
        data: { folderId },
      });
      revalidatePath("/analytics");
    }
    return { success: true };
  } catch (error) {
    console.error("Error moving item to folder:", error);
    return { success: false, error: "Failed to move item" };
  }
}
