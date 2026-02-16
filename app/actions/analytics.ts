"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics, hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import {
  calculateViewStats,
  calculateRuleStats,
  resolveTableNameFromConfig,
} from "@/lib/analytics/calculate";
import { getFullAnalyticsCache, invalidateFullCache, invalidateItemCache, isRefreshLockHeld } from "@/lib/services/analytics-cache";
import { z } from "zod";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, ANALYTICS_RATE_LIMITS } from "@/lib/rate-limit-action";
import { logSecurityEvent, SEC_ANALYTICS_VIEW_DELETED } from "@/lib/security/audit-security";
import { createLogger } from "@/lib/logger";

const log = createLogger("Analytics");

// Valid analytics view types (from Prisma enum AnalyticsViewType)
const VALID_TYPES = new Set(["COUNT", "AVERAGE", "SUM", "CONVERSION", "DISTRIBUTION", "GRAPH"]);

// Valid background colors (from AnalyticsDashboard color picker)
const VALID_COLORS = new Set([
  "bg-white", "bg-red-50", "bg-yellow-50", "bg-green-50",
  "bg-blue-50", "bg-purple-50", "bg-pink-50",
]);

// Max config JSON size (16KB)
const MAX_CONFIG_SIZE = 16384;

// Runtime validation schema for analytics view config
const analyticsConfigSchema = z.object({
  model: z.enum(["Task", "Retainer", "OneTimePayment", "Transaction", "CalendarEvent"]).optional(),
  tableId: z.union([z.string(), z.number()]).optional(),
  filter: z.record(z.string().max(200), z.string().max(1000)).refine(obj => Object.keys(obj).length <= 30, "Too many filter keys").optional(),
  totalFilter: z.record(z.string().max(200), z.string().max(1000)).refine(obj => Object.keys(obj).length <= 30, "Too many filter keys").optional(),
  successFilter: z.record(z.string().max(200), z.string().max(1000)).refine(obj => Object.keys(obj).length <= 30, "Too many filter keys").optional(),
  groupByField: z.string().max(200).optional(),
  dateRangeType: z.enum(["all", "this_week", "last_30_days", "last_year", "custom"]).optional(),
  customStartDate: z.string().max(50).optional(),
  customEndDate: z.string().max(50).optional(),
  chartType: z.string().max(200).optional(),
  yAxisMeasure: z.string().max(200).optional(),
  yAxisField: z.string().max(200).optional(),
}).strip();

// Plan limits for analytics views
const ANALYTICS_LIMITS = {
  basic: { regular: 5, graph: 3 },
  premium: { regular: 15, graph: 10 },
  super: { regular: Infinity, graph: Infinity },
};

function validateConfigSize(config: unknown): boolean {
  try {
    return JSON.stringify(config).length <= MAX_CONFIG_SIZE;
  } catch {
    return false;
  }
}

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
    log.error("Error counting analytics views", { error: String(error) });
    return {
      success: false,
      error: "Failed to count views",
      regularCount: 0,
      graphCount: 0,
    };
  }
}

/**
 * Internal: get analytics limits for a known companyId + plan.
 * NOT exported — callers must use getAnalyticsLimits() which authenticates first.
 */
async function getAnalyticsLimitsInternal(companyId: number, plan: string) {
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
}

/**
 * Get analytics limits based on authenticated user's plan.
 * Always authenticates — no parameter overrides accepted from clients.
 */
export async function getAnalyticsLimits() {
  try {
    const user = await getCurrentUser();
    if (!user || !hasUserFlag(user, "canViewAnalytics")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!user.companyId) {
      log.error("User missing companyId", { userId: user.id });
      return { success: false, error: "User has no company" };
    }

    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.read);
    if (rl) return { success: false, error: rl.error };

    const plan = ((user.isPremium || "basic") as string).toLowerCase();
    return getAnalyticsLimitsInternal(user.companyId, plan);
  } catch (error) {
    log.error("Error getting analytics limits", { error: String(error) });
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

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.mutation);
    if (rl) return { success: false, error: rl.error };

    // Validate title length
    if (!data.title || data.title.length > 200) {
      return { success: false, error: "Title is required and must be under 200 characters" };
    }

    // Validate description length
    if (data.description && data.description.length > 2000) {
      return { success: false, error: "Description must be under 2000 characters" };
    }

    // Validate type enum
    if (!VALID_TYPES.has(data.type)) {
      return { success: false, error: "Invalid analytics view type" };
    }

    // Validate color
    if (data.color && !VALID_COLORS.has(data.color)) {
      return { success: false, error: "Invalid color" };
    }

    // Validate config structure before persisting
    const configResult = analyticsConfigSchema.safeParse(data.config);
    if (!configResult.success) {
      return { success: false, error: "Invalid analytics config" };
    }
    const strippedConfig = configResult.data;

    // Validate config size
    if (!validateConfigSize(strippedConfig)) {
      return { success: false, error: "Config is too large" };
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
          type: data.type as "COUNT" | "AVERAGE" | "SUM" | "CONVERSION" | "DISTRIBUTION" | "GRAPH",
          description: data.description,
          config: strippedConfig,
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

    // Calculate stats inline so the view has data immediately (don't rely solely on background job)
    try {
      const { stats, items, tableName } = await calculateViewStats(
        { id: result.data.id, type: result.data.type, config: result.data.config },
        user.companyId,
      );
      await withRetry(() =>
        prisma.analyticsView.update({
          where: { id: result.data.id, companyId: user.companyId },
          data: { cachedStats: { stats, items, tableName }, lastCachedAt: new Date() },
        }),
      );
    } catch (e) {
      log.error("Failed to calculate initial stats", { error: String(e) });
      // Non-fatal: view was created, background job will eventually populate stats
    }

    return { success: true, data: result.data };
  } catch (error) {
    log.error("Error creating analytics view", { error: String(error) });
    return { success: false, error: "Failed to create view" };
  }
}

export async function deleteAnalyticsView(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.mutation);
    if (rl) return { success: false, error: rl.error };

    await withRetry(() => prisma.analyticsView.delete({ where: { id, companyId: user.companyId } }));
    logSecurityEvent({ action: SEC_ANALYTICS_VIEW_DELETED, companyId: user.companyId, userId: user.id, details: { viewId: id } });
    await invalidateFullCache(user.companyId);
    await invalidateItemCache(user.companyId, "view", id);
    return { success: true };
  } catch (error) {
    log.error("Error deleting analytics view", { error: String(error) });
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

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.mutation);
    if (rl) return { success: false, error: rl.error };

    // Validate title length
    if (data.title !== undefined) {
      if (!data.title || data.title.length > 200) {
        return { success: false, error: "Title is required and must be under 200 characters" };
      }
    }

    // Validate description length
    if (data.description !== undefined && data.description.length > 2000) {
      return { success: false, error: "Description must be under 2000 characters" };
    }

    // Validate type enum
    if (data.type !== undefined && !VALID_TYPES.has(data.type)) {
      return { success: false, error: "Invalid analytics view type" };
    }

    // Validate color
    if (data.color !== undefined && !VALID_COLORS.has(data.color)) {
      return { success: false, error: "Invalid color" };
    }

    // Validate config structure if provided
    let strippedConfig: any | undefined;
    if (data.config !== undefined) {
      const configResult = analyticsConfigSchema.safeParse(data.config);
      if (!configResult.success) {
        return { success: false, error: "Invalid analytics config" };
      }
      strippedConfig = configResult.data;
      if (!validateConfigSize(strippedConfig)) {
        return { success: false, error: "Config is too large" };
      }
    }

    const view = await withRetry(() => prisma.analyticsView.update({
      where: { id, companyId: user.companyId },
      data: {
        title: data.title,
        type: data.type as "COUNT" | "AVERAGE" | "SUM" | "CONVERSION" | "DISTRIBUTION" | "GRAPH" | undefined,
        description: data.description,
        config: strippedConfig,
        color: data.color,
      },
    }));
    await invalidateFullCache(user.companyId);
    await invalidateItemCache(user.companyId, "view", id);

    // Recalculate stats inline if config or type changed
    if (data.config !== undefined || data.type !== undefined) {
      try {
        const { stats, items, tableName } = await calculateViewStats(
          { id: view.id, type: view.type, config: view.config },
          user.companyId,
        );
        await withRetry(() =>
          prisma.analyticsView.update({
            where: { id: view.id, companyId: user.companyId },
            data: { cachedStats: { stats, items, tableName }, lastCachedAt: new Date() },
          }),
        );
      } catch (e) {
        log.error("Failed to recalculate stats on update", { error: String(e) });
      }
    }

    return { success: true, data: view };
  } catch (error) {
    log.error("Error updating analytics view", { error: String(error) });
    return { success: false, error: "Failed to update view" };
  }
}

export async function getAnalyticsData() {
  try {
    const user = await getCurrentUser();
    if (!user || !hasUserFlag(user, "canViewAnalytics")) {
      return { success: false, error: "Unauthorized" };
    }

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.read);
    if (rl) return { success: false, error: rl.error };

    return getAnalyticsDataForCompany(user.companyId);
  } catch (error) {
    log.error("Error fetching analytics data", { error: String(error) });
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

/**
 * Internal: fetch analytics data for a company without auth check.
 * Used by getDashboardInitialData via getAnalyticsDataAuthed to avoid redundant getCurrentUser() calls.
 * NOT exported — callers must use getAnalyticsData() or getAnalyticsDataAuthed().
 */
async function getAnalyticsDataForCompany(companyId: number) {
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

    // Build views from DB cachedStats — with inline fallback for uncached items
    // Bound inline rule calculations to prevent resource exhaustion
    const MAX_INLINE_RULE_CALC = 10;
    let inlineRuleCalcCount = 0;

    for (const rule of filteredRules) {
      let cachedData = rule.cachedStats as any;
      const ruleTableId = parseInt((rule.triggerConfig as any).tableId || "0");

      // Fallback: calculate inline if never cached (bounded)
      if (!cachedData && inlineRuleCalcCount < MAX_INLINE_RULE_CALC) {
        inlineRuleCalcCount++;
        try {
          const result = await calculateRuleStats(rule, companyId);
          cachedData = { stats: result.stats, items: result.items };
          // Persist to DB (fire-and-forget)
          prisma.automationRule.update({
            where: { id: rule.id, companyId },
            data: { cachedStats: cachedData, lastCachedAt: new Date() },
          }).catch((e) => log.error("DB update failed for rule", { ruleId: rule.id, error: String(e) }));
        } catch (e) {
          log.error("Inline calc failed for rule", { ruleId: rule.id, error: String(e) });
        }
      }
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

    // Inline calculation fallback: if cachedStats is null, calculate on-the-fly (max 10 to limit latency)
    const MAX_INLINE_CALC = 10;
    let inlineCalcCount = 0;
    const inlineDbUpdates: Promise<any>[] = [];

    for (const view of customViews) {
      let cachedData = view.cachedStats as any;
      const viewConfig = view.config as any;

      // Fallback: calculate inline if never cached
      if (!cachedData && inlineCalcCount < MAX_INLINE_CALC) {
        inlineCalcCount++;
        try {
          const result = await calculateViewStats(view, companyId);
          cachedData = { stats: result.stats, items: result.items, tableName: result.tableName };
          // Persist to DB so next load is instant (fire-and-forget)
          inlineDbUpdates.push(
            prisma.analyticsView.update({
              where: { id: view.id, companyId },
              data: { cachedStats: cachedData, lastCachedAt: new Date() },
            }).catch((e) => log.error("DB update failed for view", { viewId: view.id, error: String(e) })),
          );
        } catch (e) {
          log.error("Inline calc failed for view", { viewId: view.id, error: String(e) });
        }
      }

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

    // Flush inline DB updates (non-blocking)
    if (inlineDbUpdates.length > 0) {
      Promise.all(inlineDbUpdates).catch(() => {});
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
          }).catch((err) => log.error("Failed to trigger background refresh", { error: String(err) }));
        }
      })
      .catch((err) => log.error("Failed to check refresh lock", { error: String(err) }));

    return { success: true, data: views };
  } catch (error) {
    log.error("Error fetching analytics data for company", { error: String(error) });
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

/**
 * Authed wrapper for getAnalyticsDataForCompany.
 * Used by getDashboardInitialData to avoid redundant getCurrentUser() calls
 * while keeping getAnalyticsDataForCompany module-private.
 */
export async function getAnalyticsDataAuthed(companyId: number) {
  const user = await getCurrentUser();
  if (!user || user.companyId !== companyId || !hasUserFlag(user, "canViewAnalytics")) {
    return { success: false, error: "Unauthorized" };
  }
  const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };
  return getAnalyticsDataForCompany(companyId);
}

export async function updateAnalyticsViewOrder(
  items: { id: number; type: "AUTOMATION" | "CUSTOM"; order: number }[],
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.uiUpdate);
    if (rl) return { success: false, error: rl.error };

    // Cap to prevent oversized transactions
    const bounded = items.slice(0, 200);

    // Validate all IDs and orders are finite integers before building raw SQL
    const allValid = bounded.every(
      (i) => Number.isFinite(i.id) && Number.isFinite(i.order)
        && (i.type === "AUTOMATION" || i.type === "CUSTOM"),
    );
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
    log.error("Error updating analytics view order", { error: String(error) });
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

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.uiUpdate);
    if (rl) return { success: false, error: rl.error };

    // Validate color
    if (!VALID_COLORS.has(color)) {
      return { success: false, error: "Invalid color" };
    }

    // Validate type
    if (type !== "AUTOMATION" && type !== "CUSTOM") {
      return { success: false, error: "Invalid type" };
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
    log.error("Error updating analytics view color", { error: String(error) });
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

    // Rate limit
    const rl = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.mutation);
    if (rl) return { success: false, error: rl.error };

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

      await tx.analyticsRefreshLog.create({ data: { userId: user.id, companyId: user.companyId } });
      return usageCount + 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3000, timeout: 5000 });

    if (logCreated === null) {
      return {
        success: false,
        error: `הגעת למגבלת הרענונים בחבילה שלך (${maxRefreshes}). שדרג ל-Premium כדי לקבל יותר.`,
      };
    }

    // 2. Validate itemId belongs to user's company
    if (itemType === "CUSTOM") {
      const exists = await prisma.analyticsView.count({ where: { id: itemId, companyId: user.companyId } });
      if (!exists) return { success: false, error: "Item not found" };
    } else {
      const exists = await prisma.automationRule.count({ where: { id: itemId, companyId: user.companyId } });
      if (!exists) return { success: false, error: "Item not found" };
    }

    // 3. Trigger background job
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
    log.error("Error refreshing analytics item", { error: String(error) });
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
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // Rate limit: 5 previews per 30 seconds per user (atomic pipeline with in-memory fallback)
    const rlPreview = await checkActionRateLimit(String(user.id), ANALYTICS_RATE_LIMITS.preview);
    if (rlPreview) return { success: false, error: "יותר מדי בקשות תצוגה מקדימה. נסה שוב בעוד מספר שניות." };

    // Validate type enum
    if (!VALID_TYPES.has(data.type)) {
      return { success: false, error: "Invalid analytics view type" };
    }

    // Validate config structure
    const configResult = analyticsConfigSchema.safeParse(data.config);
    if (!configResult.success) {
      return { success: false, error: "Invalid analytics config" };
    }
    const strippedConfig = configResult.data;

    // Validate config size
    if (!validateConfigSize(strippedConfig)) {
      return { success: false, error: "Config is too large" };
    }

    // Build a temporary view object for calculateViewStats
    const tempView = {
      id: 0,
      type: data.type,
      config: strippedConfig,
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
    log.error("Error previewing analytics view", { error: String(error) });
    return { success: false, error: "Failed to preview view" };
  }
}
