"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { getGoalsWithProgress } from "@/app/actions/goals";
import { getAnalyticsData } from "@/app/actions/analytics";
import { getTables } from "@/app/actions/tables";
import {
  getCachedGoals,
  getCachedTableWidget,
  setCachedTableWidget,
  buildWidgetHash,
} from "@/lib/services/dashboard-cache";

export async function getDashboardInitialData() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Try to load goals from cache first
  const cachedGoals = await getCachedGoals(user.companyId);

  const [analyticsRes, tablesRes, goals] = await Promise.all([
    getAnalyticsData(),
    getTables(),
    cachedGoals ? Promise.resolve(cachedGoals) : getGoalsWithProgress(),
  ]);

  const analyticsViews =
    analyticsRes.success && analyticsRes.data ? analyticsRes.data : [];
  const tables = tablesRes.success && tablesRes.data ? tablesRes.data : [];

  // P140: Batch fetch all views in a single query instead of N+1
  const tableIds = tables.map((t) => t.id);
  const allViews = tableIds.length > 0
    ? await prisma.view.findMany({
        where: { tableId: { in: tableIds }, companyId: user.companyId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const viewsByTable = new Map<number, typeof allViews>();
  for (const view of allViews) {
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

/**
 * Internal: fetch table view data without auth check.
 * Used by Inngest background jobs for cache pre-computation.
 */
export async function getTableViewDataInternal(
  tableId: number,
  companyId: number,
  viewId: number,
): Promise<any | null> {
  const table = await prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
  });
  if (!table) return null;

  const view = await prisma.view.findFirst({
    where: { id: viewId, tableId, companyId },
  });
  if (!view) return null;

  const { processViewServer } = await import("@/lib/viewProcessorServer");

  return processViewServer({
    tableId,
    companyId,
    config: view.config as any,
  });
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
 * Internal: fetch custom table data without auth check.
 * Used by Inngest background jobs for cache pre-computation.
 */
export async function getCustomTableDataInternal(
  tableId: number,
  companyId: number,
  settings: {
    columns?: string[];
    limit?: number;
    sort?: "asc" | "desc";
    sortBy?: string;
  },
): Promise<any | null> {
  const limit = Math.min(settings.limit || 10, 500);
  const sort = settings.sort || "desc";
  const sortBy = settings.sortBy || "createdAt";

  let orderBy: any = {};

  const isDbSort = sortBy === "createdAt" || sortBy === "updatedAt";

  if (isDbSort) {
    orderBy = { [sortBy]: sort };
  } else {
    orderBy = { createdAt: "desc" };
  }

  const table = await prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    include: {
      records: {
        where: { companyId },
        orderBy: orderBy,
        take: isDbSort ? limit + 1 : 1000,
        include: {
          creator: { select: { name: true } },
          updater: { select: { name: true } },
        },
      },
    },
  });

  if (!table) return null;

  const schema = table.schemaJson as any[];

  const columns = settings.columns
    ? [
        ...schema
          .filter((f: any) => settings.columns?.includes(f.name))
          .map((f: any) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            options: f.options,
            optionColors: f.optionColors,
          })),
        ...(settings.columns?.includes("createdAt")
          ? [{ name: "createdAt", label: "נוצר בתאריך", type: "datetime" }]
          : []),
        ...(settings.columns?.includes("updatedAt")
          ? [{ name: "updatedAt", label: "עודכן בתאריך", type: "datetime" }]
          : []),
        ...(settings.columns?.includes("createdBy")
          ? [{ name: "createdBy", label: "נוצר על ידי", type: "string" }]
          : []),
        ...(settings.columns?.includes("updatedBy")
          ? [{ name: "updatedBy", label: "עודכן על ידי", type: "string" }]
          : []),
      ]
    : schema.slice(0, 7).map((f: any) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        options: f.options,
        optionColors: f.optionColors,
      }));

  let records = table.records.map((r) => ({
    ...r,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.creator?.name || "מערכת",
    updatedBy: r.updater?.name || "מערכת",
  }));

  // In-memory sort for JSON fields if needed
  if (sortBy !== "createdAt" && sortBy !== "updatedAt") {
    const fieldSchema = schema.find((f) => f.name === sortBy);
    const isNumeric = [
      "number",
      "rating",
      "score",
      "Rating",
      "Score",
    ].includes(fieldSchema?.type);

    records.sort((a: any, b: any) => {
      const valA = a.data?.[sortBy];
      const valB = b.data?.[sortBy];

      if (valA === undefined && valB === undefined) return 0;
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;

      if (isNumeric) {
        return sort === "asc"
          ? Number(valA) - Number(valB)
          : Number(valB) - Number(valA);
      }
      return sort === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }

  const hasMore = records.length > limit;
  records = records.slice(0, limit);

  return {
    type: "custom-table",
    title: table.name,
    data: {
      columns,
      records,
      hasMore,
      tableSlug: table.slug,
      schema: schema,
      currentSort: { field: sortBy, direction: sort },
      tableId: table.id,
    },
  };
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
