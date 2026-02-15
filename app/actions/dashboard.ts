"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { User } from "@/lib/permissions";
import { getGoalsForCompany } from "@/app/actions/goals";
import { getAnalyticsDataForCompany } from "@/app/actions/analytics";
import { getTablesForDashboard } from "@/app/actions/tables";
import {
  getCachedGoals,
  getCachedTableWidget,
  setCachedTableWidget,
  buildWidgetHash,
} from "@/lib/services/dashboard-cache";
import { withRetry } from "@/lib/db-retry";
import { getTableViewDataInternal, getCustomTableDataInternal } from "@/lib/dashboard-internal";

function settled<T>(result: PromiseSettledResult<T>, label: string, fallback: T): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[Dashboard] ${label} failed:`, result.reason);
  return fallback;
}

export async function getDashboardInitialData(existingUser?: User) {
  const user = existingUser ?? await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Try to load goals from cache first (stale-while-revalidate)
  const cachedGoals = await getCachedGoals(user.companyId);

  // If cache is stale, trigger async background refresh while serving stale data
  // Fire-and-forget: don't await — the whole point of SWR is to serve stale data immediately
  if (cachedGoals?.stale) {
    import("@/lib/inngest/client")
      .then(({ inngest }) =>
        inngest.send({
          id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 60000)}`,
          name: "dashboard/refresh-goals",
          data: { companyId: user.companyId },
        }),
      )
      .catch(() => {});
  }

  // Fetch analytics, tables, goals, AND views all in parallel (eliminates views waterfall)
  const results = await Promise.allSettled([
    getAnalyticsDataForCompany(user.companyId),
    getTablesForDashboard(user),
    cachedGoals ? Promise.resolve(cachedGoals.data) : getGoalsForCompany(user.companyId),
    withRetry(() => prisma.view.findMany({
      where: { companyId: user.companyId, isEnabled: true },
      select: { id: true, tableId: true, name: true, config: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      take: 500,
    })),
  ]);

  const analyticsRes = settled(results[0], "analytics", { success: false as const, data: [] as any[] });
  const tablesRes = settled(results[1], "tables", { success: false as const, data: [] as any[] });
  const goals = settled(results[2], "goals", [] as any[]);
  const allViews = settled(results[3], "views", [] as any[]);

  const analyticsViews =
    analyticsRes.success && analyticsRes.data ? analyticsRes.data : [];
  const tables = tablesRes.success && tablesRes.data ? tablesRes.data : [];

  // Filter views to only those belonging to accessible tables (permission filtering in-memory)
  const tableIdSet = new Set(tables.map((t) => t.id));
  const viewsByTable = new Map<number, typeof allViews>();
  for (const view of allViews) {
    if (!tableIdSet.has(view.tableId)) continue;
    const existing = viewsByTable.get(view.tableId) || [];
    existing.push(view);
    viewsByTable.set(view.tableId, existing);
  }

  const tablesWithViews = tables.map((table) => ({
    ...table,
    views: viewsByTable.get(table.id) || [],
  }));

  return {
    analyticsViews,
    tables: tablesWithViews,
    goals,
  };
}

export async function getTableViewData(
  tableId: number,
  viewId: number | string,
  bypassCache?: boolean,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    if (viewId === "custom") {
      return {
        success: false,
        error: "Use getCustomTableData for custom widgets",
      };
    }

    // Check cache first (skip when user triggers manual refresh)
    const hash = buildWidgetHash(tableId, viewId);
    if (!bypassCache) {
      const cached = await getCachedTableWidget(user.companyId, hash);
      if (cached) {
        return { success: true, data: cached };
      }
    }

    // Cache miss — compute live
    const data = await getTableViewDataInternal(tableId, user.companyId, Number(viewId));
    if (!data) return { success: false, error: "Table or view not found" };

    // Cache for next time
    await setCachedTableWidget(user.companyId, hash, data);

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching table view data", error);
    return { success: false, error: "Failed to fetch data" };
  }
}

export async function getCustomTableData(
  tableId: number,
  settings: {
    columns?: string[];
    limit?: number;
    sort?: "asc" | "desc";
    sortBy?: string;
  },
  bypassCache?: boolean,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Check cache first (skip when user triggers manual refresh)
    const hash = buildWidgetHash(tableId, "custom", settings);
    if (!bypassCache) {
      const cached = await getCachedTableWidget(user.companyId, hash);
      if (cached) {
        return { success: true, data: cached };
      }
    }

    // Cache miss — compute live
    const data = await getCustomTableDataInternal(tableId, user.companyId, settings);
    if (!data) return { success: false, error: "Table not found" };

    // Cache for next time
    await setCachedTableWidget(user.companyId, hash, data);

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching custom table data", error);
    return { success: false, error: "Failed to fetch data" };
  }
}

/**
 * Batch fetch table data for multiple widgets in a single server action call.
 * Uses cache-first strategy — only computes live for cache misses.
 */
export async function getBatchTableData(
  requests: Array<{
    widgetId: string;
    tableId: number;
    viewId: number | string;
    settings?: any;
  }>,
  bypassCache?: boolean,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // FFF: Limit batch size to prevent abuse
    if (requests.length > 50) {
      return { success: false, error: "Too many requests in batch (max 50)" };
    }

    // Process in chunks of 5 to limit concurrent DB queries
    const BATCH_CONCURRENCY = 5;
    const results: Array<{ widgetId: string; success: boolean; data?: any; error?: string }> = [];

    for (let i = 0; i < requests.length; i += BATCH_CONCURRENCY) {
      const chunk = requests.slice(i, i + BATCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async ({ widgetId, tableId, viewId, settings }) => {
          try {
            let res;
            if (typeof viewId === "string" && viewId === "custom") {
              res = await getCustomTableData(tableId, settings || {}, bypassCache);
            } else {
              res = await getTableViewData(
                tableId,
                typeof viewId === "string" ? Number(viewId) : viewId,
                bypassCache,
              );
            }
            return { widgetId, ...res };
          } catch (err) {
            console.error(`Error fetching data for widget ${widgetId}`, err);
            return { widgetId, success: false, error: "Failed to fetch data" };
          }
        }),
      );
      results.push(...chunkResults);
    }

    return { success: true, results };
  } catch (error) {
    console.error("Error in batch table data fetch", error);
    return { success: false, error: "Failed to fetch batch data" };
  }
}
