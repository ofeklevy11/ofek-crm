"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";

interface DashboardWidgetInput {
  widgetType: "ANALYTICS" | "TABLE" | "GOAL" | "TABLE_VIEWS_DASHBOARD";
  referenceId?: string; // Made optional
  tableId?: number;
  settings?: any; // New settings field - for TABLE_VIEWS_DASHBOARD includes views: ViewItem[]
}

/**
 * Get all dashboard widgets for the current user
 */
export async function getDashboardWidgets() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const widgets = await withRetry(() => prisma.dashboardWidget.findMany({
      where: { userId: user.id, companyId: user.companyId },
      orderBy: { order: "asc" },
      take: 200,
    }));

    return { success: true, data: widgets };
  } catch (error) {
    console.error("Error fetching dashboard widgets:", error);
    return { success: false, error: "Failed to fetch widgets" };
  }
}

/**
 * Add a new widget to the dashboard
 */
export async function addDashboardWidget(data: DashboardWidgetInput) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Atomic max+1 order assignment — prevents duplicate order from concurrent adds
    const widget = await prisma.$transaction(async (tx) => {
      const [{ nextOrder }] = await tx.$queryRaw<[{ nextOrder: number }]>`
        SELECT COALESCE(MAX("order"), -1) + 1 AS "nextOrder"
        FROM "DashboardWidget"
        WHERE "userId" = ${user.id} AND "companyId" = ${user.companyId}
        FOR UPDATE
      `;

      return tx.dashboardWidget.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          widgetType: data.widgetType,
          referenceId: data.referenceId || "custom",
          tableId: data.tableId,
          settings: data.settings ?? undefined,
          order: nextOrder,
        },
      });
    }, { maxWait: 5000, timeout: 10000 });

    // Pre-compute cache for the new widget (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => console.error("[DashboardWidgets] Failed to send refresh:", e));

    return { success: true, data: widget };
  } catch (error) {
    console.error("Error adding dashboard widget:", error);
    return { success: false, error: "Failed to add widget" };
  }
}

/**
 * Remove a widget from the dashboard
 */
export async function removeDashboardWidget(widgetId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify ownership (defense-in-depth: companyId in query)
    const widget = await withRetry(() => prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    }));

    if (!widget) {
      return { success: false, error: "Widget not found or unauthorized" };
    }

    // SECURITY: Atomic companyId + userId check in delete WHERE clause
    await withRetry(() => prisma.dashboardWidget.delete({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
    }));

    // Trigger cache cleanup for orphaned widget entries (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => console.error("[DashboardWidgets] Failed to send refresh:", e));

    return { success: true };
  } catch (error) {
    console.error("Error removing dashboard widget:", error);
    return { success: false, error: "Failed to remove widget" };
  }
}

/**
 * Update the order of dashboard widgets
 */
export async function updateDashboardWidgetOrder(widgetIds: string[]) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (widgetIds.length > 200) {
      return { success: false, error: "Too many widgets to reorder" };
    }

    // Single SQL statement instead of N individual updates
    await withRetry(() => prisma.$executeRaw`
      UPDATE "DashboardWidget" AS w
      SET "order" = v.new_order, "updatedAt" = NOW()
      FROM (
        SELECT unnest(${widgetIds}::text[]) AS id,
               generate_series(0, ${widgetIds.length - 1}) AS new_order
      ) AS v
      WHERE w.id = v.id AND w."userId" = ${user.id} AND w."companyId" = ${user.companyId}
    `);

    return { success: true };
  } catch (error) {
    console.error("Error updating widget order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

/**
 * Migrate widgets from localStorage (one-time migration helper)
 * This can be called on first load to move existing localStorage widgets to DB
 */
export async function migrateDashboardWidgets(
  localStorageWidgets: DashboardWidgetInput[],
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (localStorageWidgets.length > 200) {
      return { success: false, error: "Too many widgets to migrate" };
    }

    // Atomic check+insert inside transaction to prevent duplicate migration from concurrent first-loads
    const migrated = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.dashboardWidget.count({
        where: { userId: user.id, companyId: user.companyId },
      });

      if (existingCount > 0) {
        return false; // Already migrated
      }

      const rows = localStorageWidgets.map((w, index) => ({
        companyId: user.companyId,
        userId: user.id,
        widgetType: w.widgetType,
        referenceId: w.referenceId,
        tableId: w.tableId,
        order: index,
      }));

      if (rows.length > 0) {
        await tx.dashboardWidget.createMany({ data: rows });
      }

      return true;
    }, { maxWait: 5000, timeout: 10000 });

    return { success: true, migrated };
  } catch (error) {
    console.error("Error migrating dashboard widgets:", error);
    return { success: false, error: "Failed to migrate widgets" };
  }
}

/**
 * Update widget settings (e.g. valid for custom widgets)
 */
/**
 * Update a widget's full configuration
 */
export async function updateDashboardWidget(
  widgetId: string,
  data: Partial<DashboardWidgetInput>,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify ownership (defense-in-depth: companyId in query)
    const widget = await withRetry(() => prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    }));

    if (!widget) {
      return { success: false, error: "Widget not found" };
    }

    // Build update data object dynamically
    const updateData: any = {};
    if (data.referenceId !== undefined)
      updateData.referenceId = data.referenceId;
    if (data.tableId !== undefined) updateData.tableId = data.tableId;
    if (data.settings !== undefined)
      updateData.settings = data.settings ?? Prisma.DbNull;
    // We don't typically update widgetType, but could if needed

    // SECURITY: Atomic companyId + userId check in update WHERE clause
    await withRetry(() => prisma.dashboardWidget.update({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
      data: updateData,
    }));

    // Refresh cache with updated widget settings (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => console.error("[DashboardWidgets] Failed to send refresh:", e));

    return { success: true };
  } catch (error) {
    console.error("Error updating widget:", error);
    return { success: false, error: "Failed to update widget" };
  }
}

/**
 * Update widget settings (e.g. valid for custom widgets)
 */
export async function updateDashboardWidgetSettings(
  widgetId: string,
  settings: any,
) {
  return updateDashboardWidget(widgetId, { settings });
}
