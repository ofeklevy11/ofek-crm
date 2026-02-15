"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import {
  calculateViewStats,
  resolveTableNameFromConfig,
} from "@/lib/analytics/calculate";
import { getFullAnalyticsCache, invalidateFullCache, invalidateItemCache, isRefreshLockHeld } from "@/lib/services/analytics-cache";
import { redis } from "@/lib/redis";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";

// Runtime validation schema for analytics view config
const analyticsConfigSchema = z.object({
  model: z.enum(["Task", "Retainer", "OneTimePayment", "Transaction", "CalendarEvent"]).optional(),
  tableId: z.union([z.string(), z.number()]).optional(),
  filter: z.record(z.string(), z.string()).optional(),
  totalFilter: z.record(z.string(), z.string()).optional(),
  successFilter: z.record(z.string(), z.string()).optional(),
  groupByField: z.string().optional(),
  dateRangeType: z.enum(["all", "this_week", "last_30_days", "last_year", "custom"]).optional(),
  customStartDate: z.string().optional(),
  customEndDate: z.string().optional(),
  chartType: z.string().optional(),
  yAxisMeasure: z.string().optional(),
  yAxisField: z.string().optional(),
}).passthrough(); // Allow extra fields for forward compatibility

// Plan limits for analytics views
const ANALYTICS_LIMITS = {
  basic: { regular: 5, graph: 3 },
  premium: { regular: 15, graph: 10 },
  super: { regular: Infinity, graph: Infinity },
};

/**
 * Count analytics views by type for a company.
 * Accepts optional companyId to avoid redundant getCurrentUser() calls in server-side chains.
 */
async function getAnalyticsViewCounts(companyIdOverride?: number) {
  try {
    let companyId = companyIdOverride;
    if (!companyId) {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Unauthorized",
          regularCount: 0,
          graphCount: 0,
        };
      }
      companyId = user.companyId;
    }

    // Single groupBy query instead of two separate count queries
    const groups = await withRetry(() => prisma.analyticsView.groupBy({
      by: ["type"],
      where: { companyId },
      _count: true,
    }));

    const countMap = new Map(groups.map((g) => [g.type, g._count]));
    const regularCount = (countMap.get("CONVERSION") || 0) + (countMap.get("COUNT") || 0);
    const graphCount = countMap.get("GRAPH") || 0;

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
 * Accepts optional companyId and planOverride to avoid redundant getCurrentUser() calls.
 */
export async function getAnalyticsLimits(companyIdOverride?: number, planOverride?: string) {
  try {
    let companyId = companyIdOverride;
    let plan: string;

    if (companyId && planOverride) {
      plan = planOverride;
    } else {
      const user = await getCurrentUser();
      if (!user) {
        return { success: false, error: "Unauthorized" };
      }
      if (!user.companyId) {
        console.error("User missing companyId:", user.id);
        return { success: false, error: "User has no company" };
      }
      companyId = user.companyId;
      plan = ((user.isPremium || "basic") as string).toLowerCase();
    }

    const limits = ANALYTICS_LIMITS[plan as keyof typeof ANALYTICS_LIMITS] || ANALYTICS_LIMITS.basic;

    const countsResult = await getAnalyticsViewCounts(companyId);
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

    // Validate config structure before persisting
    const configResult = analyticsConfigSchema.safeParse(data.config);
    if (!configResult.success) {
      return { success: false, error: "Invalid analytics config" };
    }

    // Check plan limits + create atomically in a Serializable transaction
    // to prevent TOCTOU race where two concurrent requests both pass the limit check
    const userPlan = ((user.isPremium || "basic") as string).toLowerCase();
    const limits = ANALYTICS_LIMITS[userPlan as keyof typeof ANALYTICS_LIMITS] || ANALYTICS_LIMITS.basic;
    const isGraph = data.type === "GRAPH";

    const result = await prisma.$transaction(async (tx) => {
      // Re-count inside transaction to prevent TOCTOU race
      const groups = await tx.analyticsView.groupBy({
        by: ["type"],
        where: { companyId: user.companyId },
        _count: true,
      });

      const countMap = new Map(groups.map((g) => [g.type, g._count]));
      const regularCount = (countMap.get("CONVERSION") || 0) + (countMap.get("COUNT") || 0);
      const graphCount = countMap.get("GRAPH") || 0;

      // Super users have no limits
      if (userPlan !== "super") {
        if (isGraph && graphCount >= limits.graph) {
          return {
            success: false as const,
            error: `הגעת למגבלת הגרפים (${limits.graph}). שדרג את התוכנית להוספת גרפים נוספים.`,
          };
        }
        if (!isGraph && regularCount >= limits.regular) {
          return {
            success: false as const,
            error: `הגעת למגבלת האנליטיקות (${limits.regular}). שדרג את התוכנית להוספת אנליטיקות נוספות.`,
          };
        }
      }

      const view = await tx.analyticsView.create({
        data: {
          companyId: user.companyId,
          title: data.title,
          type: data.type,
          description: data.description,
          config: data.config,
          color: data.color || "bg-white",
          order: 999,
        },
      });

      return { success: true as const, data: view };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 3000,
      timeout: 5000,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await invalidateFullCache(user.companyId);
    return { success: true, data: result.data };
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
    await withRetry(() => prisma.analyticsView.delete({ where: { id, companyId: user.companyId } }));
    await invalidateFullCache(user.companyId);
    await invalidateItemCache(user.companyId, "view", id);
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

    // Validate config structure if provided
    if (data.config !== undefined) {
      const configResult = analyticsConfigSchema.safeParse(data.config);
      if (!configResult.success) {
        return { success: false, error: "Invalid analytics config" };
      }
    }

    const view = await withRetry(() => prisma.analyticsView.update({
      where: { id, companyId: user.companyId },
      data: {
        title: data.title,
        type: data.type,
        description: data.description,
        config: data.config,
        color: data.color,
      },
    }));
    await invalidateFullCache(user.companyId);
    await invalidateItemCache(user.companyId, "view", id);
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

    return getAnalyticsDataForCompany(user.companyId);
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

/**
 * Internal: fetch analytics data for a company without auth check.
 * Used by getDashboardInitialData to avoid redundant getCurrentUser() calls.
 */
export async function getAnalyticsDataForCompany(companyId: number) {
  try {
    // 1. Try Redis full cache first — instant return
    const cachedViews = await getFullAnalyticsCache(companyId);
    if (cachedViews) {
      return { success: true, data: cachedViews };
    }

    // 2. Redis miss — build views from DB cached data (no inline calculation)
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        companyId,
        isActive: true,
        actionType: {
          in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION", "MULTI_ACTION"],
        },
      },
      take: 500, // P85: Bound rules query
    }));

    // Filter MULTI_ACTION rules to only those containing a duration action
    const filteredRules = rules.filter((r: any) => {
      if (r.actionType !== "MULTI_ACTION") return true;
      const actions = (r.actionConfig as any)?.actions || [];
      return actions.some((a: any) => a.type === "CALCULATE_DURATION" || a.type === "CALCULATE_MULTI_EVENT_DURATION");
    });

    const customViews = await withRetry(() => prisma.analyticsView.findMany({
      where: { companyId },
      take: 500, // P85: Bound views query
    }));

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
      ? await withRetry(() => prisma.tableMeta.findMany({
          where: { id: { in: uniqueTableIds }, companyId },
          select: { id: true, name: true },
        }))
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
      // Resolve table name: use cached name → batch-fetched map → static model name → fallback
      // Avoids N+1: tableMap already has all live tables; deleted tables get a fallback string
      const resolvedTableName =
        cachedData?.tableName ||
        (viewTableId > 0
          ? (tableMap.get(viewTableId) ?? "טבלה לא ידועה")
          : resolveTableNameFromConfig(viewConfig, companyId));
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

    // 3. Fire background refresh to populate Redis for next request (fire-and-forget)
    isRefreshLockHeld(companyId)
      .then((alreadyRefreshing) => {
        if (!alreadyRefreshing) {
          inngest.send({
            id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`,
            name: "analytics/refresh-company",
            data: { companyId },
          }).catch((err) => console.error("[getAnalyticsData] Failed to trigger background refresh:", err));
        }
      })
      .catch((err) => console.error("[getAnalyticsData] Failed to check refresh lock:", err));

    return { success: true, data: views };
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    return { success: false, error: "Failed to fetch analytics data" };
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

    // Cap to prevent oversized transactions
    const bounded = items.slice(0, 200);

    // Validate all IDs and orders are finite integers before building raw SQL
    const allValid = bounded.every((i) => Number.isFinite(i.id) && Number.isFinite(i.order));
    if (!allValid) {
      return { success: false, error: "Invalid item data" };
    }

    // Separate items by type for efficient bulk UPDATE via unnest()
    const ruleItems = bounded.filter((i) => i.type === "AUTOMATION");
    const viewItems = bounded.filter((i) => i.type === "CUSTOM");

    await prisma.$transaction(async (tx) => {
      if (ruleItems.length > 0) {
        const ruleIds = ruleItems.map((i) => i.id);
        const ruleOrders = ruleItems.map((i) => i.order);
        await tx.$executeRaw`
          UPDATE "AutomationRule" AS r
          SET "analyticsOrder" = v.ord
          FROM unnest(${ruleIds}::int[], ${ruleOrders}::int[]) AS v(id, ord)
          WHERE r.id = v.id AND r."companyId" = ${user.companyId}
        `;
      }

      if (viewItems.length > 0) {
        const viewIds = viewItems.map((i) => i.id);
        const viewOrders = viewItems.map((i) => i.order);
        await tx.$executeRaw`
          UPDATE "AnalyticsView" AS av
          SET "order" = v.ord
          FROM unnest(${viewIds}::int[], ${viewOrders}::int[]) AS v(id, ord)
          WHERE av.id = v.id AND av."companyId" = ${user.companyId}
        `;
      }
    }, { maxWait: 5000, timeout: 10000 });
    await invalidateFullCache(user.companyId);
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
      await withRetry(() => prisma.automationRule.update({
        where: { id, companyId: user.companyId },
        data: { analyticsColor: color },
      }));
    } else {
      await withRetry(() => prisma.analyticsView.update({
        where: { id, companyId: user.companyId },
        data: { color },
      }));
    }
    await invalidateFullCache(user.companyId);
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view color:", error);
    return { success: false, error: "Failed to update color" };
  }
}

/**
 * Combined refresh action: checks eligibility, logs refresh, triggers background job,
 * and returns updated usage — all in one server action with a single getCurrentUser() call.
 * Replaces the separate checkAnalyticsRefreshEligibility + logAnalyticsRefresh +
 * refreshAnalyticsItem + getAnalyticsRefreshUsage client-side chain.
 */
export async function refreshAnalyticsItemWithChecks(
  itemId: number,
  itemType: "AUTOMATION" | "CUSTOM",
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // 1. Check eligibility + log atomically to prevent race conditions
    const plan = (user.isPremium || "basic") as string;
    const maxRefreshes = plan === "super" ? 9999 : plan === "premium" ? 10 : 3;
    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const logCreated = await prisma.$transaction(async (tx) => {
      const usageCount = await tx.analyticsRefreshLog.count({
        where: { userId: user.id, timestamp: { gt: windowStart } },
      });

      if (usageCount >= maxRefreshes) {
        return null; // Over limit
      }

      await tx.analyticsRefreshLog.create({ data: { userId: user.id } });
      return usageCount + 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3000, timeout: 5000 });

    if (logCreated === null) {
      return {
        success: false,
        error: `הגעת למגבלת הרענונים בחבילה שלך (${maxRefreshes}). שדרג ל-Premium כדי לקבל יותר.`,
      };
    }

    // 2. Trigger background job
    await inngest.send({
      name: "analytics/refresh-item",
      data: { companyId: user.companyId, itemId, itemType },
    });

    // 3. Compute updated usage
    const newUsage = logCreated;
    let nextResetTime: string | null = null;
    if (newUsage > 0) {
      const oldest = await withRetry(() => prisma.analyticsRefreshLog.findFirst({
        where: { userId: user.id, timestamp: { gt: windowStart } },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      }));
      if (oldest) {
        nextResetTime = new Date(
          oldest.timestamp.getTime() + 4 * 60 * 60 * 1000,
        ).toISOString();
      }
    }

    revalidatePath("/");
    revalidatePath("/analytics");
    revalidatePath("/analytics/graphs");

    return {
      success: true,
      data: { refreshing: true },
      usage: newUsage,
      nextResetTime,
    };
  } catch (error) {
    console.error("Error refreshing analytics item:", error);
    return { success: false, error: "Failed to refresh item" };
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

    // Rate limit: 5 previews per 30 seconds per user
    try {
      const previewKey = `analytics-preview:${user.id}`;
      const count = await redis.incr(previewKey);
      if (count === 1) await redis.expire(previewKey, 30);
      if (count > 5) {
        return { success: false, error: "יותר מדי בקשות תצוגה מקדימה. נסה שוב בעוד מספר שניות." };
      }
    } catch {
      // Redis down — allow the request through
    }

    // Validate config structure
    const configResult = analyticsConfigSchema.safeParse(data.config);
    if (!configResult.success) {
      return { success: false, error: "Invalid analytics config" };
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
