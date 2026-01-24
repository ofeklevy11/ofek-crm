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
    operator:
      | "equals"
      | "contains"
      | "includes"
      | "gt"
      | "lt"
      | "gte"
      | "lte"
      | "neq";
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
  legendField?: string; // Field to map colors for
  colorMappings?: Record<string, { color: string; description?: string }>; // Value -> color mapping
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

    // --- SECURITY CHECK: VIEW LIMITS ---
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();

    // Limits
    const plan = user?.isPremium || "basic";
    let maxViews = 3;
    if (plan === "premium") {
      maxViews = 10;
    } else if (plan === "super") {
      maxViews = 9999;
    }

    const currentCount = await prisma.view.count({
      where: { tableId: data.tableId },
    });

    if (currentCount >= maxViews) {
      return {
        success: false,
        error: `הגעת למגבלת התצוגות בחבילה שלך (${maxViews}). שדרג כדי ליצור עוד.`,
      };
    }
    // -----------------------------------

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
  },
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

    // --- CLEANUP DASHBOARD WIDGETS ---
    // Remove this view from any "Table Views" widgets (Mini Dashboard)
    try {
      const widgets = await prisma.dashboardWidget.findMany({
        where: {
          widgetType: "TABLE_VIEWS_DASHBOARD",
        },
      });

      for (const widget of widgets) {
        const settings = widget.settings as any;
        if (settings?.views && Array.isArray(settings.views)) {
          const originalLength = settings.views.length;
          const newViews = settings.views.filter(
            (v: any) => v.viewId !== viewId,
          );

          if (newViews.length !== originalLength) {
            // Update widget with removed view
            await prisma.dashboardWidget.update({
              where: { id: widget.id },
              data: {
                settings: {
                  ...settings,
                  views: newViews,
                },
              },
            });
          }
        }
      }
    } catch (cleanupError) {
      console.error(
        "Error cleaning up dashboard widgets for deleted view:",
        cleanupError,
      );
      // We continue with view deletion even if widget cleanup fails
    }
    // ---------------------------------

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
  viewOrders: Array<{ id: number; order: number }>,
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
      }),
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

export async function getUserRefreshUsage() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, usage: 0 };
    }

    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

    // Check usage global per user (not per view)
    try {
      if (!(prisma as any).viewRefreshLog) {
        return { success: true, usage: 0 };
      }

      const usageCount = await (prisma as any).viewRefreshLog.count({
        where: {
          userId: user.id,
          timestamp: { gt: windowStart },
        },
      });

      // Find the oldest log in the window to calculate when the next credit returns
      let nextResetTime = null;
      if (usageCount > 0) {
        const oldestLog = await (prisma as any).viewRefreshLog.findFirst({
          where: {
            userId: user.id,
            timestamp: { gt: windowStart },
          },
          orderBy: { timestamp: "asc" },
        });

        if (oldestLog) {
          nextResetTime = new Date(
            new Date(oldestLog.timestamp).getTime() + 4 * 60 * 60 * 1000,
          ).toISOString();
        }
      }

      return { success: true, usage: usageCount, nextResetTime };
    } catch (e) {
      console.error("Failed to check refresh usage:", e);
      return { success: true, usage: 0 };
    }
  } catch (error) {
    console.error("Error in getUserRefreshUsage:", error);
    return { success: false, usage: 0 };
  }
}
