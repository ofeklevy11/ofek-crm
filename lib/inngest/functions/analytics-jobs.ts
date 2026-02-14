import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  calculateRuleStats,
  calculateViewStats,
  getTableName,
  resolveTableNameFromConfig,
} from "@/lib/analytics/calculate";
import {
  acquireRefreshLock,
  releaseRefreshLock,
  setSingleItemCache,
  setFullAnalyticsCache,
  getFullAnalyticsCache,
} from "@/lib/services/analytics-cache";

/**
 * Full company analytics refresh.
 * Debounced per company — collapses rapid-fire events into one refresh.
 */
export const refreshCompanyAnalytics = inngest.createFunction(
  {
    id: "analytics-refresh-company",
    name: "Refresh Company Analytics",
    retries: 2,
    timeouts: { finish: "120s" },
    debounce: {
      period: "10s",
      key: "event.data.companyId",
    },
    concurrency: {
      limit: 1,
      key: "event.data.companyId",
    },
  },
  { event: "analytics/refresh-company" },
  async ({ event, step }) => {
    const { companyId } = event.data;

    // P205: Acquire lock with unique value to prevent releasing another process's lock
    const lockValue = await step.run("acquire-lock", async () => {
      return acquireRefreshLock(companyId);
    });

    if (!lockValue) {
      return { skipped: true, reason: "lock-held" };
    }

    let error: unknown = null;
    const views: any[] = [];

    try {
      // Fetch all automation rules for this company
      const allRules = await step.run("fetch-rules", async () => {
        const LIMIT = 500;
        const results = await prisma.automationRule.findMany({
          where: {
            companyId,
            isActive: true,
            actionType: {
              in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION", "MULTI_ACTION"],
            },
          },
          take: LIMIT,
        });
        if (results.length >= LIMIT) {
          console.warn(`[analytics-refresh] Company ${companyId} has ${LIMIT}+ analytics rules — some may be skipped`);
        }
        // Filter MULTI_ACTION rules to only those containing a duration action
        return results.filter((r: any) => {
          if (r.actionType !== "MULTI_ACTION") return true;
          const actions = (r.actionConfig as any)?.actions || [];
          return actions.some((a: any) => a.type === "CALCULATE_DURATION" || a.type === "CALCULATE_MULTI_EVENT_DURATION");
        });
      });
      const rules = allRules;

      // Fetch all custom views for this company
      const customViews = await step.run("fetch-views", async () => {
        const LIMIT = 500;
        const results = await prisma.analyticsView.findMany({
          where: { companyId },
          take: LIMIT,
        });
        if (results.length >= LIMIT) {
          console.warn(`[analytics-refresh] Company ${companyId} has ${LIMIT}+ analytics views — some may be skipped`);
        }
        return results;
      });

      // Process rules in batches to reduce Inngest step overhead and batch DB writes
      const RULE_BATCH = 10;
      for (let i = 0; i < rules.length; i += RULE_BATCH) {
        const batch = rules.slice(i, i + RULE_BATCH);
        const batchResults = await step.run(`calc-rules-batch-${i}`, async () => {
          const results: any[] = [];
          const dbUpdates: Promise<any>[] = [];
          const now = new Date();

          for (const rule of batch) {
            try {
              const { stats, items, tableName } = await calculateRuleStats(rule, companyId);

              dbUpdates.push(
                prisma.automationRule.update({
                  where: { id: rule.id, companyId },
                  data: { cachedStats: { stats, items }, lastCachedAt: now },
                }),
              );

              await setSingleItemCache(companyId, "rule", rule.id, { stats, items, tableName });

              // Determine effective action type for MULTI_ACTION rules
              const effectiveActionType = rule.actionType === "MULTI_ACTION"
                ? ((rule.actionConfig as any)?.actions || []).find((a: any) => a.type === "CALCULATE_MULTI_EVENT_DURATION")
                  ? "CALCULATE_MULTI_EVENT_DURATION"
                  : "CALCULATE_DURATION"
                : rule.actionType;
              results.push({
                id: `rule_${rule.id}`,
                ruleId: rule.id,
                ruleName: rule.name,
                tableName,
                type:
                  effectiveActionType === "CALCULATE_MULTI_EVENT_DURATION"
                    ? "multi-event"
                    : "single-event",
                data: items,
                stats,
                order: rule.analyticsOrder ?? 0,
                color: rule.analyticsColor ?? "bg-white",
                source: "AUTOMATION",
                folderId: rule.folderId,
                lastRefreshed: now.toISOString(),
              });
            } catch (e) {
              console.error(`[analytics-refresh] Failed to calculate rule ${rule.id}:`, e);
            }
          }

          // Batch DB writes in parallel
          if (dbUpdates.length > 0) await Promise.all(dbUpdates);
          return results;
        });
        views.push(...batchResults);
      }

      // Process views in batches
      const VIEW_BATCH = 10;
      for (let i = 0; i < customViews.length; i += VIEW_BATCH) {
        const batch = customViews.slice(i, i + VIEW_BATCH);
        const batchResults = await step.run(`calc-views-batch-${i}`, async () => {
          const results: any[] = [];
          const dbUpdates: Promise<any>[] = [];
          const now = new Date();

          for (const view of batch) {
            try {
              const { stats, items, tableName } = await calculateViewStats(view, companyId);

              dbUpdates.push(
                prisma.analyticsView.update({
                  where: { id: view.id, companyId },
                  data: { cachedStats: { stats, items, tableName }, lastCachedAt: now },
                }),
              );

              await setSingleItemCache(companyId, "view", view.id, { stats, items, tableName });

              results.push({
                id: `view_${view.id}`,
                viewId: view.id,
                ruleName: view.title,
                tableName,
                type: view.type,
                data: items,
                stats,
                order: view.order,
                color: view.color,
                source: "CUSTOM",
                config: view.config,
                folderId: view.folderId,
                lastRefreshed: now.toISOString(),
              });
            } catch (e) {
              console.error(`[analytics-refresh] Failed to calculate view ${view.id}:`, e);
            }
          }

          if (dbUpdates.length > 0) await Promise.all(dbUpdates);
          return results;
        });
        views.push(...batchResults);
      }

      // Assemble and cache full views array
      await step.run("cache-full", async () => {
        views.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        await setFullAnalyticsCache(companyId, views);
      });
    } catch (e) {
      error = e;
    }

    // Always release lock inside step.run (safe for Inngest replays)
    await step.run("release-lock", async () => {
      await releaseRefreshLock(companyId, lockValue);
    });

    if (error) throw error;

    return { success: true, viewCount: views.length };
  },
);

/**
 * Single analytics item refresh.
 * Used when user clicks manual refresh on a specific card.
 */
export const refreshAnalyticsItemJob = inngest.createFunction(
  {
    id: "analytics-refresh-item",
    name: "Refresh Analytics Item",
    retries: 2,
    timeouts: { finish: "120s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "analytics/refresh-item" },
  async ({ event, step }) => {
    const { companyId, itemId, itemType } = event.data;

    // BB10: Acquire company lock to prevent race with full refresh
    const lockValue = await step.run("acquire-lock", async () => {
      return acquireRefreshLock(companyId);
    });

    if (!lockValue) {
      return { skipped: true, reason: "lock-held" };
    }

    let error: unknown = null;
    let result: any;

    try {
      result = await step.run("calculate-item", async () => {
        if (itemType === "AUTOMATION") {
          const rule = await prisma.automationRule.findFirst({
            where: { id: itemId, companyId },
          });
          if (!rule) throw new Error("Rule not found or access denied");

          const { stats, items, tableName } = await calculateRuleStats(rule, companyId);

          await prisma.automationRule.update({
            where: { id: itemId, companyId },
            data: {
              cachedStats: { stats, items },
              lastCachedAt: new Date(),
            },
          });

          await setSingleItemCache(companyId, "rule", itemId, { stats, items, tableName });

          return { stats, items, tableName };
        } else {
          const view = await prisma.analyticsView.findFirst({
            where: { id: itemId, companyId },
          });
          if (!view) throw new Error("View not found or access denied");

          const { stats, items, tableName } = await calculateViewStats(view, companyId);

          await prisma.analyticsView.update({
            where: { id: itemId, companyId },
            data: {
              cachedStats: { stats, items, tableName },
              lastCachedAt: new Date(),
            },
          });

          await setSingleItemCache(companyId, "view", itemId, { stats, items, tableName });

          return { stats, items, tableName };
        }
      });

      // Update the full cache in-place (avoid chain-reaction full refresh)
      await step.run("update-full-cache", async () => {
        const fullCache = await getFullAnalyticsCache(companyId);
        if (fullCache && Array.isArray(fullCache)) {
          const idPrefix = itemType === "AUTOMATION" ? `rule_${itemId}` : `view_${itemId}`;
          const updatedCache = fullCache.map((item: any) => {
            if (item.id === idPrefix) {
              return {
                ...item,
                data: result.items,
                stats: result.stats,
                tableName: result.tableName,
                lastRefreshed: new Date().toISOString(),
              };
            }
            return item;
          });
          await setFullAnalyticsCache(companyId, updatedCache);
        }
      });

      // Process view automations
      await step.run("process-automations", async () => {
        try {
          const { processViewAutomations } = await import(
            "@/app/actions/automations"
          );
          await processViewAutomations(undefined, undefined, companyId);
        } catch (err) {
          console.error("[analytics-refresh-item] Failed to process view automations:", err);
        }
      });
    } catch (e) {
      error = e;
    }

    // BB10: Always release lock
    await step.run("release-lock", async () => {
      await releaseRefreshLock(companyId, lockValue);
    });

    if (error) throw error;

    return { success: true, itemId, itemType };
  },
);
