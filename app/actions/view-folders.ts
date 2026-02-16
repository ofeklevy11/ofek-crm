"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag, canManageAnalytics } from "@/lib/permissions";
import { validateViewFolderInCompany } from "@/lib/company-validation";
import { invalidateFullCache } from "@/lib/services/analytics-cache";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";

const log = createLogger("ViewFolders");

export async function createViewFolder(name: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    const folder = await prisma.viewFolder.create({
      data: {
        name,
        companyId: user.companyId,
      },
      select: {
        id: true, name: true, order: true,
        createdAt: true, updatedAt: true,
      },
    });
    await invalidateFullCache(user.companyId);
    revalidatePath("/analytics");
    return { success: true, data: folder };
  } catch (error) {
    log.error("Failed to create folder", { error: String(error) });
    return { success: false, error: "Failed to create folder" };
  }
}

export async function getViewFolders() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewAnalytics")) return { success: false, error: "Forbidden" };

    const folders = await withRetry(() =>
      prisma.viewFolder.findMany({
        where: { companyId: user.companyId },
        orderBy: { order: "asc" },
        take: 200,
        select: {
          id: true, name: true, order: true,
          createdAt: true, updatedAt: true,
        },
      })
    );
    return { success: true, data: folders };
  } catch (error) {
    log.error("Failed to fetch folders", { error: String(error) });
    return { success: false, error: "Failed to fetch folders" };
  }
}

export async function deleteViewFolder(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    // Verify folder belongs to valid company first or use matching where clause in transaction
    const folder = await withRetry(() =>
      prisma.viewFolder.findFirst({
        where: { id, companyId: user.companyId },
      })
    );

    if (!folder) return { success: false, error: "Unauthorized or not found" };

    // Manually unset folderId for items inside the folder before deleting
    // We filter updateMany/delete by companyId for safety although findFirst verified ownership essentially
    await withRetry(() =>
      prisma.$transaction([
        prisma.analyticsView.updateMany({
          where: { folderId: id, companyId: user.companyId },
          data: { folderId: null },
        }),
        prisma.automationRule.updateMany({
          where: { folderId: id, companyId: user.companyId },
          data: { folderId: null },
        }),
        prisma.viewFolder.delete({
          where: { id, companyId: user.companyId },
        }),
      ])
    );

    await invalidateFullCache(user.companyId);
    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    log.error("Failed to delete folder", { error: String(error) });
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
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    // SECURITY: Validate target folderId belongs to same company
    if (folderId) {
      if (!(await validateViewFolderInCompany(folderId, user.companyId))) {
        return { success: false, error: "Invalid folder" };
      }
    }

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
    await invalidateFullCache(user.companyId);
    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    log.error("Failed to move view", { error: String(error) });
    return { success: false, error: "Failed to move view" };
  }
}
