import { createHash } from "crypto";
import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import {
  setCachedGoals,
  setCachedTableWidget,
  buildWidgetHash,
  acquireDashboardLock,
  releaseDashboardLock,
  invalidateTableWidgetCaches,
} from "@/lib/services/dashboard-cache";

/**
 * Refresh all dashboard widget data for a company.
 * Debounced per company — collapses rapid-fire events into one refresh.
 *
 * Pre-computes:
 * 1. Goals with progress (expensive metric calculations)
 * 2. Table widget data for all users' TABLE widgets
 */
export const refreshDashboardWidgets = inngest.createFunction(
  {
    id: "dashboard-refresh-widgets",
    name: "Refresh Dashboard Widgets",
    retries: 2,
    timeouts: { finish: "90s" },
    debounce: {
      period: "15s",
      key: "event.data.companyId",
    },
    concurrency: {
      limit: 1,
      key: "event.data.companyId",
    },
  },
  { event: "dashboard/refresh-widgets" },
  async ({ event, step }) => {
    const { companyId } = event.data;

    const lockValue = await step.run("acquire-lock", async () => {
      return acquireDashboardLock(companyId);
    });

    if (!lockValue) {
      return { skipped: true, reason: "lock-held" };
    }

    let error: unknown = null;

    try {
      // Step 1: Refresh goals cache
      const goalCount = await step.run("refresh-goals", async () => {
        const { getGoalsForCompany } = await import("@/app/actions/goals");
        const goals = await getGoalsForCompany(companyId, { skipCache: true });
        await setCachedGoals(companyId, goals);
        return goals.length;
      });

      // Step 2: Find all TABLE widgets for users in this company
      const widgetRequests = await step.run("find-table-widgets", async () => {
        const widgets = await prisma.dashboardWidget.findMany({
          where: {
            companyId,
            widgetType: "TABLE",
          },
          select: {
            id: true,
            tableId: true,
            referenceId: true,
            settings: true,
          },
          orderBy: { id: "asc" },
          take: 5000, // P223: Cap widget query — 5K users × multiple widgets can be unbounded
        });

        // Deduplicate by widget hash — same table+view+settings only computed once
        const seen = new Set<string>();
        const unique: Array<{
          tableId: number;
          viewId: string;
          settings: any;
          hash: string;
        }> = [];

        for (const w of widgets) {
          if (!w.tableId || !w.referenceId) continue;
          // Only include settings in hash for custom views — standard views ignore settings
          // to match the action-side hash (which doesn't pass settings for non-custom)
          const hash = w.referenceId === "custom"
            ? buildWidgetHash(w.tableId, w.referenceId, w.settings)
            : buildWidgetHash(w.tableId, w.referenceId);
          if (seen.has(hash)) continue;
          seen.add(hash);
          unique.push({
            tableId: w.tableId,
            viewId: w.referenceId,
            settings: w.referenceId === "custom" ? w.settings : undefined,
            hash,
          });
        }

        return unique;
      });

      // Step 3: Invalidate old table widget caches to remove orphaned entries
      await step.run("invalidate-old-caches", async () => {
        await invalidateTableWidgetCaches(companyId);
      });

      // Step 4: Pre-compute each unique table widget (batched in chunks)
      const CHUNK_SIZE = 10;
      const WIDGET_TIMEOUT_MS = 20_000; // 20s per widget
      let cachedWidgets = 0;

      for (let i = 0; i < widgetRequests.length; i += CHUNK_SIZE) {
        const chunk = widgetRequests.slice(i, i + CHUNK_SIZE);
        const chunkKey = createHash("md5").update(chunk.map(r => r.hash).sort().join("+")).digest("hex").slice(0, 16);
        const stepId = `compute-widgets-${i / CHUNK_SIZE}-${chunkKey}`;
        const chunkResult = await step.run(stepId, async () => {
          const results = await Promise.all(
            chunk.map(async (req) => {
              try {
                const widgetPromise = (async () => {
                  let data: any;
                  if (req.viewId === "custom") {
                    const { getCustomTableDataInternal } = await import(
                      "@/lib/dashboard-internal"
                    );
                    data = await getCustomTableDataInternal(
                      req.tableId,
                      companyId,
                      req.settings || {},
                    );
                  } else {
                    const { getTableViewDataInternal } = await import(
                      "@/lib/dashboard-internal"
                    );
                    data = await getTableViewDataInternal(
                      req.tableId,
                      companyId,
                      Number(req.viewId),
                    );
                  }
                  return data;
                })();

                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`Widget ${req.hash} timed out`)), WIDGET_TIMEOUT_MS),
                );

                const data = await Promise.race([widgetPromise, timeoutPromise]);
                if (data) {
                  await setCachedTableWidget(companyId, req.hash, data as any);
                  return 1;
                }
                return 0;
              } catch (err) {
                console.error(
                  `[dashboard-refresh] Failed widget ${req.hash}:`,
                  err,
                );
                return 0;
              }
            }),
          );
          return results.reduce((sum, n) => sum + n, 0);
        });
        cachedWidgets += chunkResult;
      }

      return {
        success: true,
        goalCount,
        cachedWidgets,
        totalWidgetRequests: widgetRequests.length,
      };
    } catch (e) {
      error = e;
    } finally {
      await step.run("release-lock", async () => {
        await releaseDashboardLock(companyId, lockValue);
      });
    }

    if (error) throw error;
  },
);

/**
 * Lightweight job to refresh only goals cache for a company.
 * Triggered when goals are created/updated/deleted.
 */
export const refreshDashboardGoals = inngest.createFunction(
  {
    id: "dashboard-refresh-goals",
    name: "Refresh Dashboard Goals",
    retries: 2,
    timeouts: { finish: "90s" },
    debounce: {
      period: "10s",
      key: "event.data.companyId",
    },
    concurrency: {
      limit: 1,
      key: "event.data.companyId",
    },
  },
  { event: "dashboard/refresh-goals" },
  async ({ event, step }) => {
    const { companyId } = event.data;

    const goalCount = await step.run("refresh-goals", async () => {
      const { getGoalsForCompany } = await import("@/app/actions/goals");
      const goals = await getGoalsForCompany(companyId, { skipCache: true });
      await setCachedGoals(companyId, goals);
      return goals.length;
    });

    return { success: true, goalCount };
  },
);
