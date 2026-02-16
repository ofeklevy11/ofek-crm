"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, hasUserFlag } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, DASHBOARD_RATE_LIMITS } from "@/lib/rate-limit-action";
import {
  addWidgetSchema,
  updateWidgetSchema,
  widgetIdSchema,
  widgetIdsOrderSchema,
  migrateWidgetsSchema,
  MAX_WIDGETS_PER_USER,
} from "@/lib/validations/dashboard";
import { createLogger } from "@/lib/logger";

const log = createLogger("DashboardWidgets");

/**
 * Get all dashboard widgets for the current user
 */
export async function getDashboardWidgets() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!hasUserFlag(user, "canViewDashboardData")) {
      return { success: false, error: "Forbidden" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
    if (rl) return { success: false, error: rl.error };

    const widgets = await withRetry(() => prisma.dashboardWidget.findMany({
      where: { userId: user.id, companyId: user.companyId },
      orderBy: { order: "asc" },
      take: 200,
      select: {
        id: true, userId: true, widgetType: true, referenceId: true,
        tableId: true, settings: true, order: true,
        createdAt: true, updatedAt: true,
      },
    }));

    return { success: true, data: widgets };
  } catch (error) {
    log.error("Error fetching dashboard widgets", { error: String(error) });
    return { success: false, error: "Failed to fetch widgets" };
  }
}

/**
 * Add a new widget to the dashboard
 */
export async function addDashboardWidget(rawData: unknown) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.write);
    if (rl) return { success: false, error: rl.error };

    const parsed = addWidgetSchema.safeParse(rawData);
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const data = parsed.data;

    // Table permission check when a tableId is provided
    if (data.tableId && !canReadTable(user, data.tableId)) {
      return { success: false, error: "Access denied to this table" };
    }

    // Atomic max+1 order assignment + widget count limit
    const widget = await prisma.$transaction(async (tx) => {
      const [{ nextOrder, currentCount }] = await tx.$queryRaw<[{ nextOrder: number; currentCount: bigint }]>`
        SELECT COALESCE(MAX("order"), -1) + 1 AS "nextOrder",
               COUNT(*)::bigint AS "currentCount"
        FROM "DashboardWidget"
        WHERE "userId" = ${user.id} AND "companyId" = ${user.companyId}
        FOR UPDATE
      `;

      if (Number(currentCount) >= MAX_WIDGETS_PER_USER) {
        throw new Error(`Widget limit reached (max ${MAX_WIDGETS_PER_USER})`);
      }

      return tx.dashboardWidget.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          widgetType: data.widgetType as any,
          referenceId: data.referenceId || "custom",
          tableId: data.tableId,
          settings: data.settings ?? undefined,
          order: nextOrder,
        },
        select: {
          id: true, userId: true, widgetType: true, referenceId: true,
          tableId: true, settings: true, order: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 });

    // Pre-compute cache for the new widget (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => log.error("Failed to send refresh", { error: String(e) }));

    return { success: true, data: widget };
  } catch (error) {
    log.error("Error adding dashboard widget", { error: String(error) });
    return { success: false, error: "Failed to add widget" };
  }
}

/**
 * Remove a widget from the dashboard
 */
export async function removeDashboardWidget(rawWidgetId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.write);
    if (rl) return { success: false, error: rl.error };

    const parsedId = widgetIdSchema.safeParse(rawWidgetId);
    if (!parsedId.success) return { success: false, error: "Invalid widget ID" };
    const widgetId = parsedId.data;

    // Verify ownership (defense-in-depth: companyId in query)
    const widget = await withRetry(() => prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    }));

    if (!widget) {
      return { success: false, error: "Widget not found or unauthorized" };
    }

    // SECURITY: Atomic companyId + userId check in delete WHERE clause
    await withRetry(() => prisma.dashboardWidget.delete({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
    }));

    // Trigger cache cleanup for orphaned widget entries (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => log.error("Failed to send refresh", { error: String(e) }));

    return { success: true };
  } catch (error) {
    log.error("Error removing dashboard widget", { error: String(error) });
    return { success: false, error: "Failed to remove widget" };
  }
}

/**
 * Update the order of dashboard widgets
 */
export async function updateDashboardWidgetOrder(rawWidgetIds: string[]) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.write);
    if (rl) return { success: false, error: rl.error };

    const parsed = widgetIdsOrderSchema.safeParse(rawWidgetIds);
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const widgetIds = parsed.data;

    // Single SQL statement instead of N individual updates
    await withRetry(() => prisma.$executeRaw`
      UPDATE "DashboardWidget" AS w
      SET "order" = v.new_order, "updatedAt" = NOW()
      FROM (
        SELECT unnest(${widgetIds}::text[]) AS id,
               generate_series(0, ${widgetIds.length - 1}) AS new_order
      ) AS v
      WHERE w.id = v.id AND w."userId" = ${user.id} AND w."companyId" = ${user.companyId}
    `);

    return { success: true };
  } catch (error) {
    log.error("Error updating widget order", { error: String(error) });
    return { success: false, error: "Failed to update order" };
  }
}

/**
 * Migrate widgets from localStorage (one-time migration helper)
 * This can be called on first load to move existing localStorage widgets to DB
 */
export async function migrateDashboardWidgets(
  rawWidgets: unknown[],
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.migrate);
    if (rl) return { success: false, error: rl.error };

    const parsed = migrateWidgetsSchema.safeParse(rawWidgets);
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const localStorageWidgets = parsed.data;

    if (localStorageWidgets.length > MAX_WIDGETS_PER_USER) {
      return { success: false, error: `Too many widgets to migrate (max ${MAX_WIDGETS_PER_USER})` };
    }

    // Filter out widgets referencing tables the user can't access
    const authorizedWidgets = localStorageWidgets.filter(
      (w) => !w.tableId || canReadTable(user, w.tableId),
    );

    // Atomic check+insert inside transaction with FOR UPDATE to prevent duplicate migration
    const migrated = await prisma.$transaction(async (tx) => {
      const [{ cnt }] = await tx.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*)::bigint AS cnt
        FROM "DashboardWidget"
        WHERE "userId" = ${user.id} AND "companyId" = ${user.companyId}
        FOR UPDATE
      `;

      if (Number(cnt) > 0) {
        return false; // Already migrated
      }

      const rows = authorizedWidgets.map((w, index) => ({
        companyId: user.companyId,
        userId: user.id,
        widgetType: w.widgetType as any,
        referenceId: w.referenceId,
        tableId: w.tableId,
        order: index,
      }));

      if (rows.length > 0) {
        await tx.dashboardWidget.createMany({ data: rows });
      }

      return true;
    }, { maxWait: 5000, timeout: 10000 });

    return { success: true, migrated };
  } catch (error) {
    log.error("Error migrating dashboard widgets", { error: String(error) });
    return { success: false, error: "Failed to migrate widgets" };
  }
}

/**
 * Update widget settings (e.g. valid for custom widgets)
 */
/**
 * Update a widget's full configuration
 */
export async function updateDashboardWidget(
  rawWidgetId: string,
  rawData: unknown,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.write);
    if (rl) return { success: false, error: rl.error };

    const parsedId = widgetIdSchema.safeParse(rawWidgetId);
    if (!parsedId.success) return { success: false, error: "Invalid widget ID" };
    const widgetId = parsedId.data;

    const parsed = updateWidgetSchema.safeParse(rawData);
    if (!parsed.success) return { success: false, error: "Invalid input" };
    const data = parsed.data;

    // Table permission check when changing tableId
    if (data.tableId && !canReadTable(user, data.tableId)) {
      return { success: false, error: "Access denied to this table" };
    }

    // Verify ownership (defense-in-depth: companyId in query)
    const widget = await withRetry(() => prisma.dashboardWidget.findFirst({
      where: { id: widgetId, userId: user.id, companyId: user.companyId },
    }));

    if (!widget) {
      return { success: false, error: "Widget not found" };
    }

    // Build update data object dynamically
    const updateData: any = {};
    if (data.referenceId !== undefined)
      updateData.referenceId = data.referenceId;
    if (data.tableId !== undefined) updateData.tableId = data.tableId;
    if (data.settings !== undefined)
      updateData.settings = data.settings ?? Prisma.DbNull;
    // We don't typically update widgetType, but could if needed

    // SECURITY: Atomic companyId + userId check in update WHERE clause
    await withRetry(() => prisma.dashboardWidget.update({
      where: { id: widgetId, companyId: user.companyId, userId: user.id },
      data: updateData,
    }));

    // Refresh cache with updated widget settings (fire-and-forget — non-critical)
    inngest.send({
      id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
      name: "dashboard/refresh-widgets",
      data: { companyId: user.companyId },
    }).catch((e) => log.error("Failed to send refresh", { error: String(e) }));

    return { success: true };
  } catch (error) {
    log.error("Error updating widget", { error: String(error) });
    return { success: false, error: "Failed to update widget" };
  }
}

/**
 * Update widget settings (e.g. valid for custom widgets)
 */
export async function updateDashboardWidgetSettings(
  widgetId: string,
  settings: unknown,
) {
  return updateDashboardWidget(widgetId, { settings });
}
