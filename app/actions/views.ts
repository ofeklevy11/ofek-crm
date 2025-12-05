"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface ViewConfig {
  type: "stats" | "aggregation" | "chart" | "legend";
  title: string;
  // For stats views
  timeRange?: "week" | "month" | "all";
  // For aggregation views
  aggregationType?: "sum" | "count" | "avg" | "group";
  targetField?: string;
  targetFields?: string[]; // Multiple fields for calculations
  groupByField?: string;
  // For chart/visualization
  chartType?: "bar" | "pie" | "line";
  colorMapping?: Record<string, string>;
  // For filtering
  filters?: Array<{
    field: string;
    operator: "equals" | "contains" | "includes";
    value: any;
  }>;
  // Date filters - NEW
  dateFilter?: {
    field: string; // which date field to filter on
    type: "week" | "month" | "custom" | "all";
    startDate?: string; // for custom range
    endDate?: string; // for custom range
  };
  // For legend/display
  legendItems?: Array<{
    color: string;
    label: string;
    description?: string;
  }>;
}

export async function createView(data: {
  tableId: number;
  name: string;
  slug: string;
  config: ViewConfig;
  isEnabled?: boolean;
}) {
  try {
    // Get the highest order value for this table to add the new view at the end
    const maxOrderView = await prisma.view.findFirst({
      where: { tableId: data.tableId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const nextOrder = (maxOrderView?.order ?? -1) + 1;

    const view = await prisma.view.create({
      data: {
        tableId: data.tableId,
        name: data.name,
        slug: data.slug,
        config: data.config as any,
        isEnabled: data.isEnabled ?? true,
        order: nextOrder,
      },
    });

    revalidatePath(`/tables/${data.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error creating view:", error);

    // Check if it's a unique constraint error
    if (
      error.code === "P2002" ||
      error.message?.includes("Unique constraint")
    ) {
      return {
        success: false,
        error:
          "תצוגה עם אותו מזהה כבר קיימת בטבלה הזו. אנא בחר שם או מזהה אחר.",
      };
    }

    // Generic error message for other types of errors
    return {
      success: false,
      error: "אירעה שגיאה ביצירת התצוגה. אנא נסה שוב או צור קשר עם התמיכה.",
    };
  }
}

export async function updateView(
  viewId: number,
  data: {
    name?: string;
    slug?: string;
    config?: ViewConfig;
    isEnabled?: boolean;
  }
) {
  try {
    const view = await prisma.view.update({
      where: { id: viewId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.config && { config: data.config as any }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error updating view:", error);

    // Check if it's a unique constraint error
    if (
      error.code === "P2002" ||
      error.message?.includes("Unique constraint")
    ) {
      return {
        success: false,
        error: "מזהה זה כבר בשימוש. אנא בחר מזהה אחר.",
      };
    }

    // Check if view not found
    if (
      error.code === "P2025" ||
      error.message?.includes("Record to update not found")
    ) {
      return {
        success: false,
        error: "התצוגה לא נמצאה.",
      };
    }

    return {
      success: false,
      error: "אירעה שגיאה בעדכון התצוגה. אנא נסה שוב.",
    };
  }
}

export async function toggleView(viewId: number) {
  try {
    const currentView = await prisma.view.findUnique({
      where: { id: viewId },
    });

    if (!currentView) {
      return { success: false, error: "התצוגה לא נמצאה." };
    }

    const view = await prisma.view.update({
      where: { id: viewId },
      data: {
        isEnabled: !currentView.isEnabled,
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error toggling view:", error);
    return {
      success: false,
      error: "אירעה שגיאה בשינוי מצב התצוגה. אנא נסה שוב.",
    };
  }
}

export async function deleteView(viewId: number) {
  try {
    const view = await prisma.view.findUnique({
      where: { id: viewId },
    });

    if (!view) {
      return { success: false, error: "התצוגה לא נמצאה." };
    }

    await prisma.view.delete({
      where: { id: viewId },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting view:", error);
    return {
      success: false,
      error: "אירעה שגיאה במחיקת התצוגה. אנא נסה שוב.",
    };
  }
}

export async function getViewsForTable(tableId: number) {
  try {
    const views = await prisma.view.findMany({
      where: { tableId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return { success: true, views };
  } catch (error: any) {
    console.error("Error fetching views:", error);
    return { success: false, error: error.message, views: [] };
  }
}

export async function getEnabledViewsForTable(tableId: number) {
  try {
    const views = await prisma.view.findMany({
      where: {
        tableId,
        isEnabled: true,
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return { success: true, views };
  } catch (error: any) {
    console.error("Error fetching enabled views:", error);
    return { success: false, error: error.message, views: [] };
  }
}

export async function reorderViews(
  tableId: number,
  viewOrders: Array<{ id: number; order: number }>
) {
  try {
    console.log("🔄 Reordering views for table:", tableId);
    console.log("📊 New order:", viewOrders);

    // Update all views in a transaction for consistency
    await prisma.$transaction(
      viewOrders.map(({ id, order }) => {
        console.log(`  - Updating view ${id} to order ${order}`);
        return prisma.view.update({
          where: { id },
          data: { order },
        });
      })
    );

    console.log("✅ Views reordered successfully");
    revalidatePath(`/tables/${tableId}`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ Error reordering views:", error);
    console.error("Error details:", error.message, error.stack);
    return {
      success: false,
      error: "אירעה שגיאה בשינוי סדר התצוגות. אנא נסה שוב.",
    };
  }
}
