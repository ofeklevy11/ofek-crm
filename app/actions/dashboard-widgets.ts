"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";

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

    const widgets = await prisma.dashboardWidget.findMany({
      where: { userId: user.id, companyId: user.companyId },
      orderBy: { order: "asc" },
      take: 200,
    });

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

    // Get max order to place new widget at end
    const maxOrderWidget = await prisma.dashboardWidget.findFirst({
      where: { userId: user.id, companyId: user.companyId },
      orderBy: { order: "desc" },
    });
    const nextOrder = (maxOrderWidget?.order ?? -1) + 1;

    const widget = await prisma.dashboardWidget.create({
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

    // Pre-compute cache for the new widget
    try {
      await inngest.send({
        id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      console.error("[DashboardWidgets] Failed to send refresh:", e);
    }

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
    const widget = await prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    });

    if (!widget) {
      return { success: false, error: "Widget not found or unauthorized" };
    }

    // SECURITY: Atomic companyId + userId check in delete WHERE clause
    await prisma.dashboardWidget.delete({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
    });

    // Trigger cache cleanup for orphaned widget entries
    try {
      await inngest.send({
        id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      console.error("[DashboardWidgets] Failed to send refresh:", e);
    }

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

    // Update each widget's order in a transaction
    const updates = widgetIds.map((id, index) =>
      prisma.dashboardWidget.updateMany({
        where: { id, userId: user.id, companyId: user.companyId },
        data: { order: index },
      }),
    );

    await prisma.$transaction(updates);

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

    // Check if user already has widgets in DB
    const existingCount = await prisma.dashboardWidget.count({
      where: { userId: user.id, companyId: user.companyId },
    });

    if (existingCount > 0) {
      // Already migrated, skip
      return { success: true, migrated: false };
    }

    // Create all widgets
    const data = localStorageWidgets.map((w, index) => ({
      companyId: user.companyId,
      userId: user.id,
      widgetType: w.widgetType,
      referenceId: w.referenceId,
      tableId: w.tableId,
      order: index,
    }));

    if (data.length > 0) {
      await prisma.dashboardWidget.createMany({ data });
    }

    return { success: true, migrated: true };
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
    const widget = await prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    });

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
    await prisma.dashboardWidget.update({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
      data: updateData,
    });

    // Refresh cache with updated widget settings
    try {
      await inngest.send({
        id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      console.error("[DashboardWidgets] Failed to send refresh:", e);
    }

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
