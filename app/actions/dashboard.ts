"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { getAnalyticsData } from "@/app/actions/analytics";
import { getTables } from "@/app/actions/tables";
import { getViewsForTable } from "@/app/actions/views";
import { processView } from "@/lib/viewProcessor";

export async function getDashboardInitialData() {
  const [analyticsRes, tablesRes] = await Promise.all([
    getAnalyticsData(),
    getTables(),
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
  };
}

export async function getTableViewData(tableId: number, viewId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        records: {
          orderBy: { createdAt: "desc" },
          take: 1000,
        },
      },
    });

    if (!table) return { success: false, error: "Table not found" };

    const view = await prisma.view.findUnique({
      where: { id: viewId },
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
