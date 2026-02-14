"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import {
  calculateViewStats,
  resolveTableNameFromConfig,
} from "@/lib/analytics/calculate";
import { getFullAnalyticsCache, isRefreshLockHeld } from "@/lib/services/analytics-cache";

// Plan limits for analytics views
const ANALYTICS_LIMITS = {
  basic: { regular: 5, graph: 3 },
  premium: { regular: 15, graph: 10 },
  super: { regular: Infinity, graph: Infinity },
};

/**
 * Count analytics views by type for the current company.
 * Returns counts for regular (CONVERSION, COUNT) and graph (GRAPH) views.
 */
export async function getAnalyticsViewCounts() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "Unauthorized",
        regularCount: 0,
        graphCount: 0,
      };
    }

    // Count regular analytics (CONVERSION, COUNT)
    const regularCount = await prisma.analyticsView.count({
      where: {
        companyId: user.companyId,
        type: { in: ["CONVERSION", "COUNT"] },
      },
    });

    // Count graph analytics
    const graphCount = await prisma.analyticsView.count({
      where: {
        companyId: user.companyId,
        type: "GRAPH",
      },
    });

    return { success: true, regularCount, graphCount };
  } catch (error) {
    console.error("Error counting analytics views:", error);
    return {
      success: false,
      error: "Failed to count views",
      regularCount: 0,
      graphCount: 0,
    };
  }
}

/**
 * Get analytics limits based on user plan.
 */
export async function getAnalyticsLimits() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!user.companyId) {
      console.error("User missing companyId:", user.id);
      return { success: false, error: "User has no company" };
    }

    // Use user's premium status as the plan source (Company model does not have 'plan')
    const plan = (
      user.isPremium || "basic"
    ).toLowerCase() as keyof typeof ANALYTICS_LIMITS;
    const limits = ANALYTICS_LIMITS[plan] || ANALYTICS_LIMITS.basic;

    // Get current counts (pass successful user object to avoid re-fetching if possible, but existing func fetches again)
    const countsResult = await getAnalyticsViewCounts();
    if (!countsResult.success) {
      return { success: false, error: countsResult.error };
    }

    return {
      success: true,
      plan,
      limits,
      currentCounts: {
        regular: countsResult.regularCount,
        graph: countsResult.graphCount,
      },
      remaining: {
        regular: Math.max(0, limits.regular - countsResult.regularCount),
        graph: Math.max(0, limits.graph - countsResult.graphCount),
      },
    };
  } catch (error) {
    console.error("Error getting analytics limits:", error);
    return {
      success: false,
      error: "Failed to get limits (Internal Error)",
    };
  }
}

export async function createAnalyticsView(data: {
  title: string;
  type: string;
  description?: string;
  config: any;
  color?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // Check plan limits
    const limitsResult = await getAnalyticsLimits();
    if (!limitsResult.success) {
      return { success: false, error: limitsResult.error };
    }

    const { plan, remaining } = limitsResult;

    // Check if creating a graph or regular analytics
    const isGraph = data.type === "GRAPH";

    // Super users have no limits
    if (plan !== "super") {
      if (isGraph && remaining!.graph <= 0) {
        return {
          success: false,
          error: `הגעת למגבלת הגרפים (${ANALYTICS_LIMITS[plan as keyof typeof ANALYTICS_LIMITS].graph}). שדרג את התוכנית להוספת גרפים נוספים.`,
        };
      }
      if (!isGraph && remaining!.regular <= 0) {
        return {
          success: false,
          error: `הגעת למגבלת האנליטיקות (${ANALYTICS_LIMITS[plan as keyof typeof ANALYTICS_LIMITS].regular}). שדרג את התוכנית להוספת אנליטיקות נוספות.`,
        };
      }
    }

    const view = await prisma.analyticsView.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId for multi-tenancy
        title: data.title,
        type: data.type,
        description: data.description,
        config: data.config,
        color: data.color || "bg-white",
        // Put it at the end
        order: 999,
      },
    });
    return { success: true, data: view };
  } catch (error) {
    console.error("Error creating analytics view:", error);
    return { success: false, error: "Failed to create view" };
  }
}

export async function deleteAnalyticsView(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }
    await prisma.analyticsView.delete({ where: { id, companyId: user.companyId } });
    return { success: true };
  } catch (error) {
    console.error("Error deleting analytics view:", error);
    return { success: false, error: "Failed to delete view" };
  }
}

export async function updateAnalyticsView(
  id: number,
  data: {
    title?: string;
    type?: string;
    description?: string;
    config?: any;
    color?: string;
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const view = await prisma.analyticsView.update({
      where: { id, companyId: user.companyId },
      data: {
        title: data.title,
        type: data.type,
        description: data.description,
        config: data.config,
        color: data.color,
      },
    });
    return { success: true, data: view };
  } catch (error) {
    console.error("Error updating analytics view:", error);
    return { success: false, error: "Failed to update view" };
  }
}

export async function getAnalyticsData() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const companyId = user.companyId;

    // 1. Try Redis full cache first — instant return
    const cachedViews = await getFullAnalyticsCache(companyId);
    if (cachedViews) {
      return { success: true, data: cachedViews };
    }

    // 2. Redis miss — build views from DB cached data (no inline calculation)
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId,
        isActive: true,
        actionType: {
          in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION", "MULTI_ACTION"],
        },
      },
      take: 500, // P85: Bound rules query
    });

    // Filter MULTI_ACTION rules to only those containing a duration action
    const filteredRules = rules.filter((r: any) => {
      if (r.actionType !== "MULTI_ACTION") return true;
      const actions = (r.actionConfig as any)?.actions || [];
      return actions.some((a: any) => a.type === "CALCULATE_DURATION" || a.type === "CALCULATE_MULTI_EVENT_DURATION");
    });

    const customViews = await prisma.analyticsView.findMany({
      where: { companyId },
      take: 500, // P85: Bound views query
    });

    const views: any[] = [];

    // Batch-fetch all table names to avoid sequential N+1 queries
    const ruleTableIds = filteredRules
      .filter((r: any) => r.triggerType !== "TASK_STATUS_CHANGE")
      .map((r: any) => parseInt((r.triggerConfig as any).tableId || "0"))
      .filter((id: number) => id > 0);
    const viewTableIds = customViews
      .map((v: any) => Number((v.config as any)?.tableId || 0))
      .filter((id: number) => id > 0);
    const uniqueTableIds = [...new Set([...ruleTableIds, ...viewTableIds])];
    const tables = uniqueTableIds.length > 0
      ? await prisma.tableMeta.findMany({ where: { id: { in: uniqueTableIds } } })
      : [];
    const tableMap = new Map(tables.map((t: any) => [t.id, t.name]));

    // Build views from DB cachedStats — never calculate inline
    for (const rule of filteredRules) {
      const cachedData = rule.cachedStats as any;
      const ruleTableId = parseInt((rule.triggerConfig as any).tableId || "0");
      // Determine the effective duration action type for MULTI_ACTION rules
      const effectiveActionType = rule.actionType === "MULTI_ACTION"
        ? ((rule.actionConfig as any)?.actions || []).find((a: any) => a.type === "CALCULATE_MULTI_EVENT_DURATION")
          ? "CALCULATE_MULTI_EVENT_DURATION"
          : "CALCULATE_DURATION"
        : rule.actionType;
      views.push({
        id: `rule_${rule.id}`,
        ruleId: rule.id,
        ruleName: rule.name,
        tableName:
          rule.triggerType === "TASK_STATUS_CHANGE"
            ? "משימות"
            : (tableMap.get(ruleTableId) || "טבלה לא ידועה"),
        type:
          effectiveActionType === "CALCULATE_MULTI_EVENT_DURATION"
            ? "multi-event"
            : "single-event",
        data: cachedData?.items || [],
        stats: cachedData?.stats || null,
        order: rule.analyticsOrder ?? 0,
        color: rule.analyticsColor ?? "bg-white",
        source: "AUTOMATION",
        folderId: rule.folderId,
        lastRefreshed: rule.lastCachedAt,
      });
    }

    for (const view of customViews) {
      const cachedData = view.cachedStats as any;
      const viewConfig = view.config as any;
      const viewTableId = Number(viewConfig?.tableId || 0);
      const resolvedTableName =
        cachedData?.tableName ||
        (viewTableId > 0 && tableMap.has(viewTableId)
          ? tableMap.get(viewTableId)!
          : await resolveTableNameFromConfig(viewConfig, companyId));
      views.push({
        id: `view_${view.id}`,
        viewId: view.id,
        ruleName: view.title,
        tableName: resolvedTableName,
        type: view.type,
        data: cachedData?.items || [],
        stats: cachedData?.stats || null,
        order: view.order,
        color: view.color,
        source: "CUSTOM",
        config: view.config,
        folderId: view.folderId,
        lastRefreshed: view.lastCachedAt,
      });
    }

    views.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // 3. Fire background refresh to populate Redis for next request (only if not already running)
    try {
      const alreadyRefreshing = await isRefreshLockHeld(companyId);
      if (!alreadyRefreshing) {
        await inngest.send({
          id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`,
          name: "analytics/refresh-company",
          data: { companyId },
        });
      }
    } catch (err) {
      console.error("[getAnalyticsData] Failed to trigger background refresh:", err);
    }

    return { success: true, data: views };
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

/**
 * Force refresh a specific analytics item (Rule or View).
 * Triggers a background Inngest job — returns immediately with { refreshing: true }.
 */
export async function refreshAnalyticsItem(
  id: number,
  type: "AUTOMATION" | "CUSTOM",
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // Trigger background job
    await inngest.send({
      name: "analytics/refresh-item",
      data: {
        companyId: user.companyId,
        itemId: id,
        itemType: type,
      },
    });

    // Revalidate pages that display analytics
    revalidatePath("/");
    revalidatePath("/analytics");
    revalidatePath("/analytics/graphs");

    return { success: true, data: { refreshing: true } };
  } catch (error) {
    console.error("Error refreshing analytics item:", error);
    return { success: false, error: "Failed to refresh item" };
  }
}

export async function updateAnalyticsViewOrder(
  items: { id: number; type: "AUTOMATION" | "CUSTOM"; order: number }[],
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const updates = items.map((item) => {
      if (item.type === "AUTOMATION") {
        return prisma.automationRule.update({
          where: { id: item.id, companyId: user.companyId },
          data: { analyticsOrder: item.order },
        });
      } else {
        return prisma.analyticsView.update({
          where: { id: item.id, companyId: user.companyId },
          data: { order: item.order },
        });
      }
    });

    await prisma.$transaction(updates);
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function updateAnalyticsViewColor(
  id: number,
  type: "AUTOMATION" | "CUSTOM",
  color: string,
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    if (type === "AUTOMATION") {
      await prisma.automationRule.update({
        where: { id, companyId: user.companyId },
        data: { analyticsColor: color },
      });
    } else {
      await prisma.analyticsView.update({
        where: { id, companyId: user.companyId },
        data: { color },
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view color:", error);
    return { success: false, error: "Failed to update color" };
  }
}

/**
 * Preview analytics view stats without saving
 * Used for live preview in the creation modal
 */
export async function previewAnalyticsView(data: {
  type: string;
  config: any;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Build a temporary view object for calculateViewStats
    const tempView = {
      id: 0,
      type: data.type,
      config: data.config,
    };

    const { stats, items, tableName } = await calculateViewStats(tempView, user.companyId);

    return {
      success: true,
      data: {
        stats,
        items: items.slice(0, 10), // Limit preview items
        tableName,
        totalRecords: items.length,
      },
    };
  } catch (error) {
    console.error("Error previewing analytics view:", error);
    return { success: false, error: "Failed to preview view" };
  }
}
