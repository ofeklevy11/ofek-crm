import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { createLogger } from "@/lib/logger";

const log = createLogger("AnalyticsJobs");
import {
  calculateRuleStats,
  calculateViewStats,
  getTableName,
  resolveTableNameFromConfig,
  buildSourceKey,
  fetchViewSourceData,
} from "@/lib/analytics/calculate";
import {
  acquireRefreshLock,
  releaseRefreshLock,
  setSingleItemCache,
  setFullAnalyticsCache,
  getFullAnalyticsCache,
} from "@/lib/services/analytics-cache";

/**
 * Nightly cleanup of old duration records (> 12 months).
 * Prevents unbounded table growth in StatusDuration and MultiEventDuration.
 * Runs daily at 3:00 AM UTC. Uses batched deletes to avoid long-running transactions.
 */
export const cleanupOldDurationRecords = inngest.createFunction(
  {
    id: "analytics-cleanup-old-durations",
    name: "Cleanup Old Duration Records",
    retries: 1,
    timeouts: { finish: "300s" },
  },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 12 months ago
    const BATCH_SIZE = 5000;

    const statusDeleted = await step.run("delete-old-status-durations", async () => {
      let total = 0;
      let deletedCount: number;
      do {
        const result = await prisma.statusDuration.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        deletedCount = result.count;
        total += deletedCount;
      } while (deletedCount >= BATCH_SIZE);
      return total;
    });

    const multiDeleted = await step.run("delete-old-multi-event-durations", async () => {
      let total = 0;
      let deletedCount: number;
      do {
        const result = await prisma.multiEventDuration.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        deletedCount = result.count;
        total += deletedCount;
      } while (deletedCount >= BATCH_SIZE);
      return total;
    });

    return { statusDeleted, multiDeleted };
  },
);

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
          log.warn("Company has too many analytics rules — some may be skipped", { companyId, limit: LIMIT });
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
          log.warn("Company has too many analytics views — some may be skipped", { companyId, limit: LIMIT });
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
          const redisWrites: Array<() => Promise<void>> = [];
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

              redisWrites.push(() => setSingleItemCache(companyId, "rule", rule.id, { stats, items, tableName }));

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
              log.error("Failed to calculate rule", { ruleId: rule.id, error: String(e) });
            }
          }

          // Batch DB writes in a transaction for atomicity, then update Redis cache
          if (dbUpdates.length > 0) await prisma.$transaction(dbUpdates as any);
          await Promise.all(redisWrites.map(fn => fn()));
          return results;
        });
        views.push(...batchResults);
      }

      // Process all views in a single step with chunked source loading to control memory
      if (customViews.length > 0) {
        const viewResults = await step.run("calc-all-views", async () => {
          const results: any[] = [];
          const now = new Date();

          // Build a map of sourceKey → list of views that use it
          const sourceKeyToViews = new Map<string, { view: any; config: any }[]>();
          const sourceKeyToConfig = new Map<string, any>();
          for (const view of customViews) {
            const config = view.config as any;
            const key = buildSourceKey(config);
            if (!sourceKeyToViews.has(key)) {
              sourceKeyToViews.set(key, []);
              sourceKeyToConfig.set(key, config);
            }
            sourceKeyToViews.get(key)!.push({ view, config });
          }

          // Process sources in chunks to limit memory — load SOURCE_CHUNK sources at a time,
          // process all views that use them, then release before loading the next chunk
          const SOURCE_CHUNK = 5;
          const allSourceKeys = Array.from(sourceKeyToViews.keys());

          for (let si = 0; si < allSourceKeys.length; si += SOURCE_CHUNK) {
            const chunkKeys = allSourceKeys.slice(si, si + SOURCE_CHUNK);

            // Fetch this chunk of sources in parallel
            const sourceCache = new Map<string, { tableName: string; rawData: any[] }>();
            const resolved = await Promise.all(
              chunkKeys.map(async (key) => {
                const data = await fetchViewSourceData(sourceKeyToConfig.get(key)!, companyId);
                return { key, data };
              }),
            );
            for (const { key, data } of resolved) {
              sourceCache.set(key, data);
            }

            // Collect all views that use sources in this chunk
            const chunkViews: { view: any; config: any; key: string }[] = [];
            for (const key of chunkKeys) {
              for (const entry of sourceKeyToViews.get(key)!) {
                chunkViews.push({ ...entry, key });
              }
            }

            // Process these views in DB-transaction-sized batches
            const VIEW_BATCH = 10;
            for (let i = 0; i < chunkViews.length; i += VIEW_BATCH) {
              const batch = chunkViews.slice(i, i + VIEW_BATCH);
              try {
                const dbUpdates: Promise<any>[] = [];
                const redisWrites: Array<() => Promise<void>> = [];

                for (const { view, key } of batch) {
                  try {
                    const prefetched = sourceCache.get(key) || undefined;
                    const { stats, items, tableName } = await calculateViewStats(view, companyId, prefetched);

                    dbUpdates.push(
                      prisma.analyticsView.update({
                        where: { id: view.id, companyId },
                        data: { cachedStats: { stats, items, tableName }, lastCachedAt: now },
                      }),
                    );

                    redisWrites.push(() => setSingleItemCache(companyId, "view", view.id, { stats, items, tableName }));

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
                    log.error("Failed to calculate view", { viewId: view.id, error: String(e) });
                  }
                }

                // Batch DB writes in a transaction, then update Redis cache
                if (dbUpdates.length > 0) await prisma.$transaction(dbUpdates as any);
                await Promise.all(redisWrites.map(fn => fn()));
              } catch (e) {
                log.error("Batch transaction failed for views batch, continuing", { batchStart: i, error: String(e) });
              }
            }
            // sourceCache for this chunk is released when overwritten on next iteration
          }

          return results;
        });
        views.push(...viewResults);
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
          // findFirst verifies ownership (companyId) and fetches data for calculation
          const rule = await prisma.automationRule.findFirst({
            where: { id: itemId, companyId },
          });
          if (!rule) throw new Error("Rule not found or access denied");

          const { stats, items, tableName } = await calculateRuleStats(rule, companyId);

          // Ownership already verified above — update by PK only (saves compound where re-check)
          await prisma.automationRule.update({
            where: { id: itemId },
            data: {
              cachedStats: { stats, items },
              lastCachedAt: new Date(),
            },
          });

          await setSingleItemCache(companyId, "rule", itemId, { stats, items, tableName });

          return { stats, items, tableName };
        } else {
          // findFirst verifies ownership (companyId) and fetches data for calculation
          const view = await prisma.analyticsView.findFirst({
            where: { id: itemId, companyId },
          });
          if (!view) throw new Error("View not found or access denied");

          const { stats, items, tableName } = await calculateViewStats(view, companyId);

          // Ownership already verified above — update by PK only (saves compound where re-check)
          await prisma.analyticsView.update({
            where: { id: itemId },
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
        if (!fullCache || !Array.isArray(fullCache)) return;

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

        // Guard: if cache was invalidated between read and now, don't restore stale data
        const stillExists = await getFullAnalyticsCache(companyId);
        if (stillExists) {
          await setFullAnalyticsCache(companyId, updatedCache);
        }
      });

      // Process view automations
      await step.run("process-automations", async () => {
        try {
          const { processViewAutomations } = await import(
            "@/app/actions/automations-core"
          );
          await processViewAutomations(undefined, undefined, companyId);
        } catch (err) {
          log.error("Failed to process view automations", { error: String(err) });
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
