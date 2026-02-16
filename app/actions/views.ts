"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageAnalytics } from "@/lib/permissions";
import { createLogger } from "@/lib/logger";

const log = createLogger("Views");

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
    // --- SECURITY CHECK: VIEW LIMITS ---
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();

    // P107: Validate tableId belongs to user's company
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };
    const table = await prisma.tableMeta.findFirst({
      where: { id: data.tableId, companyId: user.companyId },
    });
    if (!table) return { success: false, error: "Table not found" };

    // Get the highest order value for this table to add the new view at the end
    const maxOrderView = await prisma.view.findFirst({
      where: { tableId: data.tableId, companyId: user.companyId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    // Limits
    const plan = user?.isPremium || "basic";
    let maxViews = 3;
    if (plan === "premium") {
      maxViews = 10;
    } else if (plan === "super") {
      maxViews = 9999;
    }

    const currentCount = await prisma.view.count({
      where: { tableId: data.tableId, companyId: user.companyId },
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
        companyId: user.companyId,
        tableId: data.tableId,
        name: data.name,
        slug: data.slug,
        config: data.config as any,
        isEnabled: data.isEnabled ?? true,
        order: nextOrder,
      },
      select: {
        id: true, tableId: true, name: true, slug: true, config: true,
        isEnabled: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    revalidatePath(`/tables/${data.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    log.error("Error creating view", { error: String(error) });

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
    // P107: Verify view belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    const existingView = await prisma.view.findFirst({
      where: { id: viewId, companyId: user.companyId },
    });
    if (!existingView) {
      return { success: false, error: "View not found" };
    }

    // SECURITY: Defense-in-depth — include tableId + companyId in WHERE
    const view = await prisma.view.update({
      where: { id: viewId, tableId: existingView.tableId, companyId: user.companyId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.config && { config: data.config as any }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
      select: {
        id: true, tableId: true, name: true, slug: true, config: true,
        isEnabled: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    log.error("Error updating view", { error: String(error) });

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
    // P107: Verify view belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    const currentView = await prisma.view.findFirst({
      where: { id: viewId, companyId: user.companyId },
    });

    if (!currentView) {
      return { success: false, error: "התצוגה לא נמצאה." };
    }

    // SECURITY: Defense-in-depth — include tableId + companyId in WHERE
    const view = await prisma.view.update({
      where: { id: viewId, tableId: currentView.tableId, companyId: user.companyId },
      data: {
        isEnabled: !currentView.isEnabled,
      },
      select: {
        id: true, tableId: true, name: true, slug: true, config: true,
        isEnabled: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    log.error("Error toggling view", { error: String(error) });
    return {
      success: false,
      error: "אירעה שגיאה בשינוי מצב התצוגה. אנא נסה שוב.",
    };
  }
}

export async function deleteView(viewId: number) {
  try {
    // P107: Verify view belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    const view = await prisma.view.findFirst({
      where: { id: viewId, companyId: user.companyId },
    });

    if (!view) {
      return { success: false, error: "התצוגה לא נמצאה." };
    }

    // --- CLEANUP DASHBOARD WIDGETS ---
    // Remove this view from any "Table Views" widgets in a single SQL query
    try {
      // Single UPDATE: filter out the deleted viewId from the settings->'views' array
      // Only touches widgets that actually reference this viewId
      await prisma.$executeRaw`
        UPDATE "DashboardWidget"
        SET "settings" = jsonb_set(
          "settings",
          '{views}',
          COALESCE(
            (SELECT jsonb_agg(v)
             FROM jsonb_array_elements("settings"->'views') AS v
             WHERE (v->>'viewId')::int != ${viewId}),
            '[]'::jsonb
          )
        ),
        "updatedAt" = NOW()
        WHERE "widgetType" = 'TABLE_VIEWS_DASHBOARD'
          AND "userId" = ${user.id}
          AND "companyId" = ${user.companyId}
          AND "settings"->'views' @> ${JSON.stringify([{ viewId }])}::jsonb
      `;
    } catch (cleanupError) {
      log.error("Error cleaning up dashboard widgets for deleted view", { error: String(cleanupError) });
      // We continue with view deletion even if widget cleanup fails
    }
    // ---------------------------------

    // SECURITY: Defense-in-depth — include tableId + companyId in WHERE
    await prisma.view.delete({
      where: { id: viewId, tableId: view.tableId, companyId: user.companyId },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true };
  } catch (error: any) {
    log.error("Error deleting view", { error: String(error) });
    return {
      success: false,
      error: "אירעה שגיאה במחיקת התצוגה. אנא נסה שוב.",
    };
  }
}

export async function getViewsForTable(tableId: number) {
  try {
    // P150: Verify table belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized", views: [] };

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      select: { id: true },
    });
    if (!table) return { success: false, error: "Table not found", views: [] };

    const views = await prisma.view.findMany({
      where: { tableId, companyId: user.companyId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      take: 200,
      select: {
        id: true, tableId: true, name: true, slug: true, config: true,
        isEnabled: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    return { success: true, views };
  } catch (error: any) {
    log.error("Error fetching views", { error: String(error) });
    return { success: false, error: "Failed to fetch views", views: [] };
  }
}

export async function getEnabledViewsForTable(tableId: number) {
  try {
    // P150: Verify table belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized", views: [] };

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      select: { id: true },
    });
    if (!table) return { success: false, error: "Table not found", views: [] };

    const views = await prisma.view.findMany({
      where: {
        tableId,
        companyId: user.companyId,
        isEnabled: true,
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      take: 200,
      select: {
        id: true, tableId: true, name: true, slug: true, config: true,
        isEnabled: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    return { success: true, views };
  } catch (error: any) {
    log.error("Error fetching enabled views", { error: String(error) });
    return { success: false, error: "Failed to fetch views", views: [] };
  }
}

export async function reorderViews(
  tableId: number,
  viewOrders: Array<{ id: number; order: number }>,
) {
  try {
    // P107: Verify table belongs to user's company
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!canManageAnalytics(user)) return { success: false, error: "Forbidden" };

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
    });
    if (!table) return { success: false, error: "Table not found" };

    if (viewOrders.length > 200) {
      return { success: false, error: "Too many views to reorder" };
    }

    if (viewOrders.length === 0) {
      revalidatePath(`/tables/${tableId}`);
      return { success: true };
    }

    // Validate all IDs and orders are safe integers before SQL interpolation
    for (const v of viewOrders) {
      if (!Number.isInteger(v.id) || !Number.isInteger(v.order)) {
        return { success: false, error: "Invalid view order data" };
      }
    }

    // Single SQL UPDATE with VALUES list instead of N individual updates
    const values = viewOrders
      .map((v) => `(${Number(v.id)}, ${Number(v.order)})`)
      .join(", ");

    await prisma.$executeRawUnsafe(
      `UPDATE "View" AS v
       SET "order" = vals.new_order
       FROM (VALUES ${values}) AS vals(id, new_order)
       WHERE v.id = vals.id AND v."tableId" = $1 AND v."companyId" = $2`,
      tableId,
      user.companyId,
    );
    revalidatePath(`/tables/${tableId}`);
    return { success: true };
  } catch (error: any) {
    log.error("Error reordering views", { error: String(error), stack: error.stack });
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
      let nextResetTime: string | null = null;
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
      log.error("Failed to check refresh usage", { error: String(e) });
      return { success: true, usage: 0 };
    }
  } catch (error) {
    log.error("Error in getUserRefreshUsage", { error: String(error) });
    return { success: false, usage: 0 };
  }
}
