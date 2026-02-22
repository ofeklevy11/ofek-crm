"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canManageTables, hasUserFlag } from "@/lib/permissions";
import { validateCategoryInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, TABLE_RATE_LIMITS } from "@/lib/rate-limit-action";
import { createLogger } from "@/lib/logger";
import { buildTablePermissionWhere } from "@/lib/table-permissions";
import {
  MAX_TABS,
  MAX_VISIBLE_COLUMNS,
  MAX_TABS_CONFIG_SIZE,
  MAX_DISPLAY_CONFIG_SIZE,
  parseTabsConfig,
  parseDisplayConfig,
} from "@/lib/types/table-tabs";

const log = createLogger("Tables");

export async function getTables() {
  try {
    return await getTablesForUser();
  } catch (error) {
    log.error("Error fetching tables", { error: String(error) });
    return { success: false, error: "Failed to fetch tables" };
  }
}

/**
 * Fetch tables for the authenticated user.
 * Always calls getCurrentUser() internally — never trust caller-provided User objects.
 */
export async function getTablesForUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rl = await checkActionRateLimit(String(user.id), TABLE_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };

  const where = buildTablePermissionWhere(user);

  // If basic user has no permissions, return empty immediately
  if (user.role !== "admin" && user.role !== "manager") {
    const idFilter = where.id as { in: number[] } | undefined;
    if (idFilter && idFilter.in.length === 0) {
      return { success: true, data: [] };
    }
  }

  const tables = await withRetry(() => prisma.tableMeta.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    // Note: schemaJson included because consumers (analytics, forms) rely on it
    select: {
      id: true,
      name: true,
      slug: true,
      schemaJson: true,
      tabsConfig: true,
      displayConfig: true,
      companyId: true,
      createdBy: true,
      categoryId: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  }));

  return { success: true, data: tables };
}

/**
 * Lightweight table fetch for the dashboard — excludes schemaJson to save IO.
 * schemaJson can be 50-200KB per table; the dashboard only needs id/name/slug.
 * Always calls getCurrentUser() internally — never trust caller-provided User objects.
 */
export async function getTablesForDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    return { success: true, data: [] };
  }

  const rl = await checkActionRateLimit(String(user.id), TABLE_RATE_LIMITS.read);
  if (rl) return { success: true, data: [] };

  return getTablesForDashboardInternal(user.companyId, user.role, user.tablePermissions);
}

/**
 * Internal: fetch lightweight tables for the dashboard without auth/rate-limit checks.
 * ONLY called from getDashboardInitialData which already verified auth + rate limit.
 */
export async function getTablesForDashboardInternal(
  companyId: number,
  role: string,
  tablePermissions?: any,
) {
  const where = buildTablePermissionWhere({ companyId, role, tablePermissions });

  if (role !== "admin" && role !== "manager") {
    const idFilter = where.id as { in: number[] } | undefined;
    if (idFilter && idFilter.in.length === 0) {
      return { success: true, data: [] };
    }
  }

  const tables = await withRetry(() => prisma.tableMeta.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      slug: true,
      companyId: true,
      createdBy: true,
      categoryId: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  }));

  return { success: true, data: tables };
}

export async function getTableById(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        tabsConfig: true, displayConfig: true,
        companyId: true, createdBy: true, categoryId: true,
        order: true, createdAt: true, updatedAt: true,
      },
    }));

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    if (!canReadTable(user, table.id)) {
      return { success: false, error: "אין לך הרשאה לצפות בטבלה זו" };
    }

    return { success: true, data: table };
  } catch (error) {
    log.error("Error fetching table", { error: String(error) });
    return { success: false, error: "Failed to fetch table" };
  }
}

export async function createTable(data: {
  name: string;
  slug: string;
  schemaJson?: Record<string, unknown>;
  categoryId?: number;
  tabsConfig?: Record<string, unknown>;
  displayConfig?: Record<string, unknown>;
}) {
  try {
    const { name, slug, schemaJson, categoryId, tabsConfig, displayConfig } = data;

    if (!name || !slug) {
      return { success: false, error: "Missing required fields" };
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Only admin can create tables for now (or maybe managers too if we change logic)
    // Using canManageTables which checks for admin role
    if (!canManageTables(user)) {
      return { success: false, error: "אין לך הרשאה ליצור טבלאות" };
    }

    // SECURITY: Validate categoryId belongs to same company
    if (categoryId) {
      if (!(await validateCategoryInCompany(categoryId, user.companyId))) {
        return { success: false, error: "Invalid category" };
      }
    }

    // Validate tabsConfig size and structure
    if (tabsConfig) {
      const size = JSON.stringify(tabsConfig).length;
      if (size > MAX_TABS_CONFIG_SIZE) {
        return { success: false, error: "tabsConfig exceeds size limit" };
      }
      const parsed = parseTabsConfig(tabsConfig);
      if (parsed && parsed.tabs.length > MAX_TABS) {
        return { success: false, error: `Maximum ${MAX_TABS} tabs allowed` };
      }
    }

    // Validate displayConfig size and structure
    if (displayConfig) {
      const size = JSON.stringify(displayConfig).length;
      if (size > MAX_DISPLAY_CONFIG_SIZE) {
        return { success: false, error: "displayConfig exceeds size limit" };
      }
      const parsed = parseDisplayConfig(displayConfig);
      if (parsed && parsed.visibleColumns.length > MAX_VISIBLE_COLUMNS) {
        return { success: false, error: `Maximum ${MAX_VISIBLE_COLUMNS} visible columns allowed` };
      }
    }

    // P204: Ensure slug uniqueness with retry on race condition
    let finalSlug = slug;
    let counter = 0;
    while (true) {
      const existing = await withRetry(() => prisma.tableMeta.findFirst({
        where: { slug: finalSlug, companyId: user.companyId, deletedAt: null },
        select: { id: true },
      }));
      if (!existing) break;
      finalSlug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
      counter++;
      if (counter > 10) throw new Error("Could not generate unique slug");
    }

    // Retry loop to handle check-then-create race condition (P2002)
    let table;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        table = await withRetry(() => prisma.tableMeta.create({
          data: {
            name,
            slug: finalSlug,
            schemaJson: (schemaJson || {}) as any,
            tabsConfig: tabsConfig as any ?? undefined,
            displayConfig: displayConfig as any ?? undefined,
            companyId: user.companyId,
            createdBy: user.id,
            categoryId: categoryId ? Number(categoryId) : undefined,
          },
          select: {
            id: true, name: true, slug: true, schemaJson: true,
            tabsConfig: true, displayConfig: true,
            companyId: true, createdBy: true, categoryId: true,
            order: true, createdAt: true, updatedAt: true,
          },
        }));
        break; // success
      } catch (createErr: any) {
        if (createErr.code === "P2002" && attempt < 2) {
          // Race condition: another request took this slug — generate a new one and retry
          finalSlug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
          continue;
        }
        throw createErr; // re-throw on last attempt or non-P2002 error
      }
    }

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: table };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        error: "שגיאה: שם המזהה (slug) כבר קיים במערכת. אנא נסה שם אחר.",
      };
    }
    log.error("Error creating table", { error: String(error) });
    return {
      success: false,
      error: "Failed to create table",
    };
  }
}

export async function updateTable(
  id: number,
  data: {
    name?: string;
    slug?: string;
    schemaJson?: Record<string, unknown>;
    categoryId?: number | null;
    tabsConfig?: Record<string, unknown> | null;
    displayConfig?: Record<string, unknown> | null;
  },
) {
  try {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.schemaJson !== undefined) updateData.schemaJson = data.schemaJson;
    if (data.categoryId !== undefined) {
      updateData.categoryId = data.categoryId;
    }
    if (data.tabsConfig !== undefined) {
      // Validate size
      if (data.tabsConfig !== null) {
        const size = JSON.stringify(data.tabsConfig).length;
        if (size > MAX_TABS_CONFIG_SIZE) {
          return { success: false, error: "tabsConfig exceeds size limit" };
        }
        const parsed = parseTabsConfig(data.tabsConfig);
        if (parsed && parsed.tabs.length > MAX_TABS) {
          return { success: false, error: `Maximum ${MAX_TABS} tabs allowed` };
        }
      }
      updateData.tabsConfig = data.tabsConfig;
    }
    if (data.displayConfig !== undefined) {
      if (data.displayConfig !== null) {
        const size = JSON.stringify(data.displayConfig).length;
        if (size > MAX_DISPLAY_CONFIG_SIZE) {
          return { success: false, error: "displayConfig exceeds size limit" };
        }
        const parsed = parseDisplayConfig(data.displayConfig);
        if (parsed && parsed.visibleColumns.length > MAX_VISIBLE_COLUMNS) {
          return { success: false, error: `Maximum ${MAX_VISIBLE_COLUMNS} visible columns allowed` };
        }
      }
      updateData.displayConfig = data.displayConfig;
    }

    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "אין לך הרשאה לערוך טבלאות" };
    }

    // SECURITY: Validate categoryId belongs to same company
    if (data.categoryId) {
      if (!(await validateCategoryInCompany(data.categoryId, user.companyId))) {
        return { success: false, error: "Invalid category" };
      }
    }

    // R19: Atomic soft-delete guard via updateMany + follow-up findFirst
    const result = await withRetry(() => prisma.tableMeta.updateMany({
      where: { id, companyId: user.companyId, deletedAt: null },
      data: updateData,
    }));
    if (result.count === 0) {
      return { success: false, error: "Table not found" };
    }
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        tabsConfig: true, displayConfig: true,
        companyId: true, createdBy: true, categoryId: true,
        order: true, createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/");
    revalidatePath("/tables");
    revalidatePath(`/tables/${id}`);

    return { success: true, data: table };
  } catch (error) {
    log.error("Error updating table", { error: String(error) });
    return { success: false, error: "Failed to update table" };
  }
}

export async function deleteTable(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "אין לך הרשאה למחוק טבלאות" };
    }

    // P113: Add companyId to prevent cross-tenant table deletes
    await withRetry(() => prisma.tableMeta.delete({
      where: { id, companyId: user.companyId },
    }));

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true };
  } catch (error) {
    log.error("Error deleting table", { error: String(error) });
    return { success: false, error: "Failed to delete table" };
  }
}

export async function exportTableData(tableId: number) {
  try {
    // Auth check — the streaming API endpoint handles the actual export
    const user = await getCurrentUser();
    if (!user || !canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לייצא טבלה זו" };
    }

    if (!hasUserFlag(user, "canExportTables")) {
      return { success: false, error: "אין לך הרשאה לייצא נתונים" };
    }

    // Verify table exists and belongs to user's company
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    }));

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    // Redirect to the streaming API endpoint instead of accumulating in memory
    return { success: true, redirectUrl: `/api/tables/${tableId}/export` };
  } catch (error) {
    log.error("Error exporting table", { error: String(error) });
    return { success: false, error: "Failed to export table" };
  }
}

export async function searchInTable(tableId: number, searchTerm: string) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לחפש בטבלה זו" };
    }

    // P109: Add companyId filter to table lookup
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    }));

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    if (!hasUserFlag(user, "canSearchTables")) {
      return { success: false, error: "אין לך הרשאה לחפש בטבלאות" };
    }

    // DB-side ILIKE search instead of loading all records into memory
    const escaped = searchTerm.replace(/[%_\\]/g, "\\$&");
    const records = await withRetry(() => prisma.$queryRaw<any[]>`
      SELECT id, data
      FROM "Record"
      WHERE "tableId" = ${tableId}
        AND "companyId" = ${user.companyId}
        AND "data"::text ILIKE ${`%${escaped}%`}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `);

    return { success: true, data: records };
  } catch (error) {
    log.error("Error searching in table", { error: String(error) });
    return { success: false, error: "Failed to search in table" };
  }
}

export async function updateTablesOrder(
  updates: { id: number; order: number }[],
) {
  try {
    // Check perms
    const user = await getCurrentUser();
    if (!user || !canManageTables(user)) {
      return { success: false, error: "Unauthorized" };
    }

    // BBB: Limit batch size and add companyId to prevent cross-tenant reorder
    if (updates.length > 500) {
      return { success: false, error: "Too many tables to reorder" };
    }

    if (updates.length === 0) {
      return { success: true };
    }

    // Validate all IDs and orders are finite numbers before building raw SQL
    if (!updates.every((u) => Number.isFinite(Number(u.id)) && Number.isFinite(Number(u.order)))) {
      return { success: false, error: "Invalid table order data" };
    }

    // Single SQL UPDATE using unnest with fully parameterized arrays
    const ids = updates.map((u) => Number(u.id));
    const orders = updates.map((u) => Number(u.order));

    await withRetry(() => prisma.$executeRaw`
      UPDATE "TableMeta" AS t
      SET "order" = v.new_order
      FROM unnest(${ids}::int[], ${orders}::int[]) AS v(id, new_order)
      WHERE t.id = v.id AND t."companyId" = ${user.companyId}
    `);
    revalidatePath("/tables");
    return { success: true };
  } catch (error) {
    log.error("Error updating table order", { error: String(error) });
    return { success: false, error: "Failed to update table order" };
  }
}

export async function duplicateTable(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!canManageTables(user)) {
      return { success: false, error: "אין לך הרשאה לשכפל טבלאות" };
    }

    // CRITICAL: Filter by companyId for multi-tenancy — fetch metadata only (no records/views)
    const originalTable = await withRetry(() => prisma.tableMeta.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        tabsConfig: true, displayConfig: true,
        categoryId: true, order: true,
      },
    }));

    if (!originalTable) {
      return { success: false, error: "Table not found" };
    }

    // Generate unique slug with "-copy" suffix
    let baseSlug = `${originalTable.slug}-copy`;
    let finalSlug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await withRetry(() => prisma.tableMeta.findFirst({
        where: { slug: finalSlug, companyId: user.companyId, deletedAt: null },
        select: { id: true },
      }));
      if (!existing) break;
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
      if (counter > 100) throw new Error("Could not generate unique slug");
    }

    // Generate new name with " copy" suffix
    const newName = `${originalTable.name} copy${counter > 0 ? ` ${counter}` : ""}`;

    // Wrap all three operations in a single transaction to ensure atomicity
    const newTable = await prisma.$transaction(async (tx) => {
      // Create the new table
      const created = await tx.tableMeta.create({
        data: {
          name: newName,
          slug: finalSlug,
          schemaJson: originalTable.schemaJson as any,
          tabsConfig: originalTable.tabsConfig as any ?? undefined,
          displayConfig: originalTable.displayConfig as any ?? undefined,
          companyId: user.companyId,
          createdBy: user.id,
          categoryId: originalTable.categoryId,
          order: originalTable.order,
        },
        select: {
          id: true, name: true, slug: true, schemaJson: true,
          tabsConfig: true, displayConfig: true,
          companyId: true, createdBy: true, categoryId: true,
          order: true, createdAt: true, updatedAt: true,
        },
      });

      // Copy records directly inside PostgreSQL — no data transfer to Node.js
      await tx.$executeRaw`
        INSERT INTO "Record" ("tableId", "companyId", "data", "createdBy", "createdAt", "updatedAt")
        SELECT ${created.id}, "companyId", "data", ${user.id}, NOW(), NOW()
        FROM "Record"
        WHERE "tableId" = ${id} AND "companyId" = ${user.companyId}
      `;

      // Copy views directly inside PostgreSQL
      await tx.$executeRaw`
        INSERT INTO "View" ("companyId", "tableId", "name", "slug", "config", "isEnabled", "order", "createdAt", "updatedAt")
        SELECT "companyId", ${created.id}, "name", "slug", "config", "isEnabled", "order", NOW(), NOW()
        FROM "View"
        WHERE "tableId" = ${id} AND "companyId" = ${user.companyId}
      `;

      return created;
    }, { maxWait: 5000, timeout: 30000 });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: newTable };
  } catch (error: any) {
    log.error("Error duplicating table", { error: String(error) });
    return {
      success: false,
      error: "Failed to duplicate table",
    };
  }
}
