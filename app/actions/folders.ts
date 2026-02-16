"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { validateViewFolderInCompany } from "@/lib/company-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Folders");

export type FolderType = "ANALYTICS" | "AUTOMATION";

export async function getFolders(type: FolderType) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  const requiredFlag = type === "ANALYTICS" ? "canViewAnalytics" : "canViewAutomations";
  if (!hasUserFlag(user, requiredFlag)) return { success: false, error: "Forbidden" };

  try {
    const folders = await prisma.viewFolder.findMany({
      where: {
        companyId: user.companyId,
        type,
      },
      orderBy: { order: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        type: true,
        order: true,
        createdAt: true,
        updatedAt: true,
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
    log.error("Error fetching folders", { error: String(error) });
    return { success: false, error: "Failed to fetch folders" };
  }
}

export async function createFolder(name: string, type: FolderType) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  const requiredFlag = type === "ANALYTICS" ? "canViewAnalytics" : "canViewAutomations";
  if (!hasUserFlag(user, requiredFlag)) return { success: false, error: "Forbidden" };

  try {
    const folder = await prisma.viewFolder.create({
      data: {
        companyId: user.companyId,
        name,
        type,
      },
      select: { id: true, name: true, type: true, order: true, createdAt: true, updatedAt: true },
    });

    revalidatePath(type === "AUTOMATION" ? "/automations" : "/analytics");
    return { success: true, data: folder };
  } catch (error) {
    log.error("Error creating folder", { error: String(error) });
    return { success: false, error: "Failed to create folder" };
  }
}

export async function updateFolder(id: number, name: string) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const existing = await prisma.viewFolder.findFirst({ where: { id, companyId: user.companyId }, select: { type: true } });
    if (!existing) return { success: false, error: "Folder not found" };
    const requiredFlag = existing.type === "ANALYTICS" ? "canViewAnalytics" : "canViewAutomations";
    if (!hasUserFlag(user, requiredFlag)) return { success: false, error: "Forbidden" };

    const folder = await prisma.viewFolder.update({
      where: { id, companyId: user.companyId },
      data: { name },
      select: { id: true, name: true, type: true, order: true, createdAt: true, updatedAt: true },
    });

    revalidatePath(
      folder.type === "AUTOMATION" ? "/automations" : "/analytics"
    );
    return { success: true, data: folder };
  } catch (error) {
    log.error("Error updating folder", { error: String(error) });
    return { success: false, error: "Failed to update folder" };
  }
}

export async function deleteFolder(id: number) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const existing = await prisma.viewFolder.findFirst({ where: { id, companyId: user.companyId }, select: { type: true } });
    if (!existing) return { success: false, error: "Folder not found" };
    const requiredFlag = existing.type === "ANALYTICS" ? "canViewAnalytics" : "canViewAutomations";
    if (!hasUserFlag(user, requiredFlag)) return { success: false, error: "Forbidden" };

    const folder = await prisma.viewFolder.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath(
      folder.type === "AUTOMATION" ? "/automations" : "/analytics"
    );
    return { success: true };
  } catch (error) {
    log.error("Error deleting folder", { error: String(error) });
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
  const requiredFlag = itemType === "ANALYTICS" ? "canViewAnalytics" : "canViewAutomations";
  if (!hasUserFlag(user, requiredFlag)) return { success: false, error: "Forbidden" };

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
    log.error("Error moving item to folder", { error: String(error) });
    return { success: false, error: "Failed to move item" };
  }
}
