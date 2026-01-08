"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { getGoalsWithProgress } from "@/app/actions/goals";
import { getAnalyticsData } from "@/app/actions/analytics";
import { getTables } from "@/app/actions/tables";
import { getViewsForTable } from "@/app/actions/views";
import { processView } from "@/lib/viewProcessor";

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
    })
  );

  return {
    analyticsViews,
    tables: tablesWithViews,
    goals,
  };
}

export async function getTableViewData(tableId: number, viewId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // CRITICAL: Filter by companyId
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      include: {
        records: {
          where: { companyId: user.companyId },
          orderBy: { createdAt: "desc" },
          take: 1000,
        },
      },
    });

    if (!table) return { success: false, error: "Table not found" };

    // Verify view belongs to this table
    const view = await prisma.view.findFirst({
      where: { id: viewId, tableId },
    });

    if (!view) return { success: false, error: "View not found" };

    const schema = table.schemaJson as any[];
    const records = table.records.map((r) => ({
      ...r,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const processed = processView(view.config as any, records, schema);

    return { success: true, data: processed };
  } catch (error) {
    console.error("Error fetching table view data", error);
    return { success: false, error: "Failed to fetch data" };
  }
}
