"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

interface DashboardWidgetInput {
  widgetType: "ANALYTICS" | "TABLE" | "GOAL";
  referenceId: string;
  tableId?: number;
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
      where: { userId: user.id },
      orderBy: { order: "asc" },
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
      where: { userId: user.id },
      orderBy: { order: "desc" },
    });
    const nextOrder = (maxOrderWidget?.order ?? -1) + 1;

    const widget = await prisma.dashboardWidget.create({
      data: {
        userId: user.id,
        widgetType: data.widgetType,
        referenceId: data.referenceId,
        tableId: data.tableId,
        order: nextOrder,
      },
    });

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

    // Verify ownership
    const widget = await prisma.dashboardWidget.findUnique({
      where: { id: widgetId },
    });

    if (!widget || widget.userId !== user.id) {
      return { success: false, error: "Widget not found or unauthorized" };
    }

    await prisma.dashboardWidget.delete({
      where: { id: widgetId },
    });

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

    // Update each widget's order in a transaction
    const updates = widgetIds.map((id, index) =>
      prisma.dashboardWidget.updateMany({
        where: { id, userId: user.id },
        data: { order: index },
      })
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
  localStorageWidgets: DashboardWidgetInput[]
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Check if user already has widgets in DB
    const existingCount = await prisma.dashboardWidget.count({
      where: { userId: user.id },
    });

    if (existingCount > 0) {
      // Already migrated, skip
      return { success: true, migrated: false };
    }

    // Create all widgets
    const data = localStorageWidgets.map((w, index) => ({
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
