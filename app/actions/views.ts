"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface ViewConfig {
  type: "stats" | "aggregation" | "chart" | "legend";
  title: string;
  // For stats views
  timeRange?: "week" | "month" | "all";
  // For aggregation views
  aggregationType?: "sum" | "count" | "avg" | "group";
  targetField?: string;
  targetFields?: string[]; // Multiple fields for calculations
  groupByField?: string;
  // For chart/visualization
  chartType?: "bar" | "pie" | "line";
  colorMapping?: Record<string, string>;
  // For filtering
  filters?: Array<{
    field: string;
    operator: "equals" | "contains" | "includes";
    value: any;
  }>;
  // Date filters - NEW
  dateFilter?: {
    field: string; // which date field to filter on
    type: "week" | "month" | "custom" | "all";
    startDate?: string; // for custom range
    endDate?: string; // for custom range
  };
  // For legend/display
  legendItems?: Array<{
    color: string;
    label: string;
    description?: string;
  }>;
}

export async function createView(data: {
  tableId: number;
  name: string;
  slug: string;
  config: ViewConfig;
  isEnabled?: boolean;
}) {
  try {
    const view = await prisma.view.create({
      data: {
        tableId: data.tableId,
        name: data.name,
        slug: data.slug,
        config: data.config as any,
        isEnabled: data.isEnabled ?? true,
      },
    });

    revalidatePath(`/tables/${data.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error creating view:", error);
    return { success: false, error: error.message };
  }
}

export async function updateView(
  viewId: number,
  data: {
    name?: string;
    slug?: string;
    config?: ViewConfig;
    isEnabled?: boolean;
  }
) {
  try {
    const view = await prisma.view.update({
      where: { id: viewId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.config && { config: data.config as any }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error updating view:", error);
    return { success: false, error: error.message };
  }
}

export async function toggleView(viewId: number) {
  try {
    const currentView = await prisma.view.findUnique({
      where: { id: viewId },
    });

    if (!currentView) {
      return { success: false, error: "View not found" };
    }

    const view = await prisma.view.update({
      where: { id: viewId },
      data: {
        isEnabled: !currentView.isEnabled,
      },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true, view };
  } catch (error: any) {
    console.error("Error toggling view:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteView(viewId: number) {
  try {
    const view = await prisma.view.findUnique({
      where: { id: viewId },
    });

    if (!view) {
      return { success: false, error: "View not found" };
    }

    await prisma.view.delete({
      where: { id: viewId },
    });

    revalidatePath(`/tables/${view.tableId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting view:", error);
    return { success: false, error: error.message };
  }
}

export async function getViewsForTable(tableId: number) {
  try {
    const views = await prisma.view.findMany({
      where: { tableId },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, views };
  } catch (error: any) {
    console.error("Error fetching views:", error);
    return { success: false, error: error.message, views: [] };
  }
}

export async function getEnabledViewsForTable(tableId: number) {
  try {
    const views = await prisma.view.findMany({
      where: {
        tableId,
        isEnabled: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, views };
  } catch (error: any) {
    console.error("Error fetching enabled views:", error);
    return { success: false, error: error.message, views: [] };
  }
}
