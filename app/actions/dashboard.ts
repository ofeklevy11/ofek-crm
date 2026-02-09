"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { getGoalsWithProgress } from "@/app/actions/goals";
import { getAnalyticsData } from "@/app/actions/analytics";
import { getTables } from "@/app/actions/tables";
import { getViewsForTable } from "@/app/actions/views";

export async function getDashboardInitialData() {
  const [analyticsRes, tablesRes, goals] = await Promise.all([
    getAnalyticsData(),
    getTables(),
    getGoalsWithProgress(),
  ]);

  const analyticsViews =
    analyticsRes.success && analyticsRes.data ? analyticsRes.data : [];
  const tables = tablesRes.success && tablesRes.data ? tablesRes.data : [];

  const tablesWithViews = await Promise.all(
    tables.map(async (table) => {
      const viewsRes = await getViewsForTable(table.id);
      return {
        ...table,
        views: viewsRes.success && viewsRes.views ? viewsRes.views : [],
      };
    }),
  );

  return {
    analyticsViews,
    tables: tablesWithViews,
    goals,
  };
}

export async function getTableViewData(
  tableId: number,
  viewId: number | string,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // CRITICAL: Filter by companyId
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
    });

    if (!table) return { success: false, error: "Table not found" };

    // If viewId is "custom", we can't really do much without settings passed.
    // This function is for standard views. For custom widgets, use getCustomTableData.
    // However, to keep backward compatibility or simple usage:
    if (viewId === "custom") {
      return {
        success: false,
        error: "Use getCustomTableData for custom widgets",
      };
    }

    // Verify view belongs to this table
    const view = await prisma.view.findFirst({
      where: { id: Number(viewId), tableId },
    });

    if (!view) return { success: false, error: "View not found" };

    const { processViewServer } = await import("@/lib/viewProcessorServer");

    // Process view server-side on full dataset
    const processed = await processViewServer({
      tableId,
      companyId: user.companyId,
      config: view.config as any,
    });

    return { success: true, data: processed };
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
    sortBy?: string; // New field for column sorting
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const limit = settings.limit || 10;
    const sort = settings.sort || "desc";
    const sortBy = settings.sortBy || "createdAt";

    let orderBy: any = {};

    // Handle sorting
    if (sortBy === "createdAt" || sortBy === "updatedAt") {
      orderBy = { [sortBy]: sort };
    } else {
      // For JSON fields, we need raw query or just fetch and sort in memory since Prisma JSON filtering is limited
      // But for simplicity/performance on small subset (1000 limit in fetch), we can fetch then sort?
      // Actually, for "Top 10" we really want DB sort.
      // Prisma doesn't support easy dynamic JSON sort yet.
      // We will fallback to "createdAt" for DB fetch, then sort in memory if needed?
      // Or if it's a real column?
      // For this CRM, most custom fields are in 'data' JSON.
      // We will default to createdAt for DB query for now, and re-sort in memory if data volume is low.
      orderBy = { createdAt: "desc" };
    }

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      include: {
        records: {
          where: { companyId: user.companyId },
          orderBy: orderBy,
          take: 1000, // Fetch more to allow in-memory sort of top items if needed
          include: {
            creator: { select: { name: true } },
            updater: { select: { name: true } },
          },
        },
      },
    });

    if (!table) return { success: false, error: "Table not found" };

    const schema = table.schemaJson as any[];

    // Filter columns if specified
    // Also include system columns if requested
    // Include full field info (type, optionColors, etc.) for proper rendering
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
        })); // Default to first 7 if not specified

    let records = table.records.map((r) => ({
      ...r,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Map relations to flat values if preferred, or keep as objects
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
        // String sort
        return sort === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    } else if (orderBy.createdAt && sortBy !== "createdAt") {
      // If we queried by createdAt but want to sort by something else (e.g system field updatedAt)
      records.sort((a: any, b: any) => {
        const valA = new Date(a[sortBy]).getTime();
        const valB = new Date(b[sortBy]).getTime();
        return sort === "asc" ? valA - valB : valB - valA;
      });
    }

    // Apply limit after sorting
    const hasMore = records.length > limit;
    records = records.slice(0, limit);

    return {
      success: true,
      data: {
        type: "custom-table",
        title: table.name,
        data: {
          columns,
          records,
          hasMore,
          totalCount: table.records.length,
          tableSlug: table.slug,
          schema: schema, // Return full schema for filter usage
          currentSort: { field: sortBy, direction: sort },
          tableId: table.id,
        },
      },
    };
  } catch (error) {
    console.error("Error fetching custom table data", error);
    return { success: false, error: "Failed to fetch data" };
  }
}

/**
 * Batch fetch table data for multiple widgets in a single server action call.
 * Eliminates the N+1 pattern where each widget triggers a separate request.
 */
export async function getBatchTableData(
  requests: Array<{
    widgetId: string;
    tableId: number;
    viewId: number | string;
    settings?: any;
  }>,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const results = await Promise.all(
      requests.map(async ({ widgetId, tableId, viewId, settings }) => {
        try {
          let res;
          if (typeof viewId === "string" && viewId === "custom") {
            res = await getCustomTableData(tableId, settings || {});
          } else {
            res = await getTableViewData(
              tableId,
              typeof viewId === "string" ? Number(viewId) : viewId,
            );
          }
          return { widgetId, ...res };
        } catch (err) {
          console.error(`Error fetching data for widget ${widgetId}`, err);
          return { widgetId, success: false, error: "Failed to fetch data" };
        }
      }),
    );

    return { success: true, results };
  } catch (error) {
    console.error("Error in batch table data fetch", error);
    return { success: false, error: "Failed to fetch batch data" };
  }
}
