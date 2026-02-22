"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, hasUserFlag } from "@/lib/permissions";
import { getGoalsForCompanyInternal } from "@/lib/services/goal-computation";
import { getAnalyticsDataForDashboard } from "@/app/actions/analytics";
import { getTablesForDashboardInternal } from "@/app/actions/tables";
import { GOALS_DEDUP_WINDOW_MS } from "@/lib/constants/dedup";
import {
  getCachedGoals,
  getCachedTableWidget,
  setCachedTableWidget,
  buildWidgetHash,
} from "@/lib/services/dashboard-cache";
import { withRetry } from "@/lib/db-retry";
import { getTableViewDataInternal, getCustomTableDataInternal } from "@/lib/dashboard-internal";
import { checkActionRateLimit, DASHBOARD_RATE_LIMITS } from "@/lib/rate-limit-action";
import {
  tableViewDataSchema,
  customTableSettingsSchema,
  batchTableDataSchema,
} from "@/lib/validations/dashboard";
import { createLogger } from "@/lib/logger";

const log = createLogger("Dashboard");

function settled<T>(result: PromiseSettledResult<T>, label: string, fallback: T): T {
  if (result.status === "fulfilled") return result.value;
  log.error(`${label} failed`, { error: String(result.reason) });
  return fallback;
}

export async function getDashboardInitialData() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewDashboardData")) throw new Error("Forbidden");

  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
  if (rl) throw new Error(rl.error);

  // Try to load goals from cache first (stale-while-revalidate)
  const cachedGoals = await getCachedGoals(user.companyId);

  // If cache is stale, trigger async background refresh while serving stale data
  // Fire-and-forget: don't await — the whole point of SWR is to serve stale data immediately
  if (cachedGoals?.stale) {
    import("@/lib/inngest/client")
      .then(({ inngest }) =>
        inngest.send({
          id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / GOALS_DEDUP_WINDOW_MS)}`,
          name: "dashboard/refresh-goals",
          data: { companyId: user.companyId },
        }),
      )
      .catch(() => {});
  }

  // S5: For non-admin users, pre-compute allowedTableIds to filter views at DB level
  const isFullAccess = user.role === "admin" || user.role === "manager";
  const allowedTableIds = !isFullAccess && user.tablePermissions
    ? Object.entries(user.tablePermissions as Record<string, string>)
        .filter(([, perm]) => perm === "read" || perm === "write")
        .map(([id]) => Number(id))
    : undefined;

  // Fetch analytics, tables, goals, AND views all in parallel
  // S1: Use internal variants — auth + rate limit already checked above
  const results = await Promise.allSettled([
    getAnalyticsDataForDashboard(user.companyId),
    getTablesForDashboardInternal(user.companyId, user.role, user.tablePermissions),
    // S3: Pass skipCache since we already checked cache above
    cachedGoals ? Promise.resolve(cachedGoals.data) : getGoalsForCompanyInternal(user.companyId, { skipCache: true }),
    withRetry(() => prisma.view.findMany({
      where: {
        companyId: user.companyId,
        isEnabled: true,
        // S5: Filter at DB level for non-admin users
        ...(allowedTableIds ? { tableId: { in: allowedTableIds } } : {}),
      },
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

  // Group views by table (views are already permission-filtered from DB query)
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
  rawTableId: number,
  rawViewId: number | string,
  bypassCache?: boolean,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
    if (rl) return { success: false, error: rl.error };

    const parsed = tableViewDataSchema.safeParse({ tableId: rawTableId, viewId: rawViewId, bypassCache });
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const { tableId, viewId } = parsed.data;

    if (!canReadTable(user, tableId)) {
      return { success: false, error: "Access denied" };
    }

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
    log.error("Error fetching table view data", { error: String(error) });
    return { success: false, error: "Failed to fetch data" };
  }
}

export async function getCustomTableData(
  rawTableId: number,
  rawSettings: {
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

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
    if (rl) return { success: false, error: rl.error };

    const tableId = rawTableId;
    if (typeof tableId !== "number" || tableId < 1 || !Number.isInteger(tableId)) {
      return { success: false, error: "Invalid input" };
    }

    const parsedSettings = customTableSettingsSchema.safeParse(rawSettings);
    if (!parsedSettings.success) return { success: false, error: "Invalid settings" };
    const settings = parsedSettings.data;

    if (!canReadTable(user, tableId)) {
      return { success: false, error: "Access denied" };
    }

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
    log.error("Error fetching custom table data", { error: String(error) });
    return { success: false, error: "Failed to fetch data" };
  }
}

/**
 * Batch fetch table data for multiple widgets in a single server action call.
 * Uses cache-first strategy — only computes live for cache misses.
 */
export async function getBatchTableData(
  rawRequests: Array<{
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

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.batch);
    if (rl) return { success: false, error: rl.error };

    const parsed = batchTableDataSchema.safeParse({ requests: rawRequests, bypassCache });
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const { requests } = parsed.data;

    // Filter out requests for tables the user can't access
    const authorizedRequests = requests.filter((r) => canReadTable(user, r.tableId));

    // Process in chunks of 5 to limit concurrent DB queries
    const BATCH_CONCURRENCY = 5;
    const results: Array<{ widgetId: string; success: boolean; data?: any; error?: string }> = [];

    for (let i = 0; i < authorizedRequests.length; i += BATCH_CONCURRENCY) {
      const chunk = authorizedRequests.slice(i, i + BATCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async ({ widgetId, tableId, viewId, settings }) => {
          try {
            const isCustom = typeof viewId === "string" && viewId === "custom";
            const hash = buildWidgetHash(tableId, viewId, isCustom ? settings : undefined);

            // Check cache first (skip when user triggers manual refresh)
            if (!bypassCache) {
              const cached = await getCachedTableWidget(user.companyId, hash);
              if (cached) {
                return { widgetId, success: true, data: cached };
              }
            }

            // Cache miss — compute live using internal functions (no redundant auth/rate-limit)
            let data;
            if (isCustom) {
              data = await getCustomTableDataInternal(tableId, user.companyId, settings || {});
            } else {
              data = await getTableViewDataInternal(
                tableId,
                user.companyId,
                typeof viewId === "string" ? Number(viewId) : viewId,
              );
            }

            if (!data) {
              return { widgetId, success: false, error: "Table or view not found" };
            }

            // Cache for next time
            await setCachedTableWidget(user.companyId, hash, data);
            return { widgetId, success: true, data };
          } catch (err) {
            log.error("Error fetching data for widget", { widgetId, error: String(err) });
            return { widgetId, success: false, error: "Failed to fetch data" };
          }
        }),
      );
      results.push(...chunkResults);
    }

    return { success: true, results };
  } catch (error) {
    log.error("Error in batch table data fetch", { error: String(error) });
    return { success: false, error: "Failed to fetch batch data" };
  }
}
