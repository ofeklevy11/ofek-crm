"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canManageTables, hasUserFlag } from "@/lib/permissions";
import { validateCategoryInCompany } from "@/lib/company-validation";

export async function getTables() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const tables = await prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Filter tables based on user permissions
    const allowedTables = tables.filter((table) =>
      canReadTable(user, table.id),
    );

    return { success: true, data: allowedTables };
  } catch (error) {
    console.error("Error fetching tables:", error);
    return { success: false, error: "Failed to fetch tables" };
  }
}

export async function getTableById(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const table = await prisma.tableMeta.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    if (!canReadTable(user, table.id)) {
      return { success: false, error: "אין לך הרשאה לצפות בטבלה זו" };
    }

    return { success: true, data: table };
  } catch (error) {
    console.error("Error fetching table:", error);
    return { success: false, error: "Failed to fetch table" };
  }
}

export async function createTable(data: {
  name: string;
  slug: string;
  schemaJson?: Record<string, unknown>;
  categoryId?: number;
}) {
  try {
    const { name, slug, schemaJson, categoryId } = data;

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

    // P204: Ensure slug uniqueness with retry on race condition
    let finalSlug = slug;
    let counter = 0;
    while (true) {
      const existing = await prisma.tableMeta.findFirst({
        where: { slug: finalSlug, companyId: user.companyId },
      });
      if (!existing) break;
      finalSlug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
      counter++;
      if (counter > 10) throw new Error("Could not generate unique slug");
    }

    // Retry loop to handle check-then-create race condition (P2002)
    let table;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        table = await prisma.tableMeta.create({
          data: {
            name,
            slug: finalSlug,
            schemaJson: (schemaJson || {}) as any,
            companyId: user.companyId,
            createdBy: user.id,
            categoryId: categoryId ? Number(categoryId) : undefined,
          },
        });
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
    console.error("Error creating table:", error);
    return {
      success: false,
      error: "Failed to create table: " + (error.message || "Unknown error"),
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

    // P112: Add companyId to prevent cross-tenant table updates
    const table = await prisma.tableMeta.update({
      where: { id, companyId: user.companyId },
      data: updateData,
    });

    revalidatePath("/");
    revalidatePath("/tables");
    revalidatePath(`/tables/${id}`);

    return { success: true, data: table };
  } catch (error) {
    console.error("Error updating table:", error);
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
    await prisma.tableMeta.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true };
  } catch (error) {
    console.error("Error deleting table:", error);
    return { success: false, error: "Failed to delete table" };
  }
}

export async function exportTableData(tableId: number) {
  try {
    // AAA: Auth check BEFORE loading data to prevent memory waste on unauthorized access
    const user = await getCurrentUser();
    if (!user || !canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לייצא טבלה זו" };
    }

    if (!hasUserFlag(user, "canExportTables")) {
      return { success: false, error: "אין לך הרשאה לייצא נתונים" };
    }

    // AAA: Use findFirst with companyId filter instead of findUnique
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      include: {
        records: { take: 5000 }, // P220: Lowered from 50K — prevents OOM on serverless
      },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    return { success: true, data: table };
  } catch (error) {
    console.error("Error exporting table:", error);
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
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    if (!hasUserFlag(user, "canSearchTables")) {
      return { success: false, error: "אין לך הרשאה לחפש בטבלאות" };
    }

    // P106: Add companyId filter and take limit to prevent OOM
    const records = await prisma.record.findMany({
      where: {
        tableId,
        companyId: user.companyId, // P109: Cross-tenant filter
      },
      orderBy: { createdAt: "desc" },
      take: 5000, // P106: Bound search query
    });

    const filteredRecords = records.filter((record) => {
      const dataStr = JSON.stringify(record.data).toLowerCase();
      return dataStr.includes(searchTerm.toLowerCase());
    });

    return { success: true, data: filteredRecords };
  } catch (error) {
    console.error("Error searching in table:", error);
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

    const transaction = updates.map((update) =>
      prisma.tableMeta.update({
        where: { id: update.id, companyId: user.companyId },
        data: { order: update.order },
      }),
    );

    await prisma.$transaction(transaction);
    revalidatePath("/tables");
    return { success: true };
  } catch (error) {
    console.error("Error updating table order:", error);
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

    // CRITICAL: Filter by companyId for multi-tenancy
    const originalTable = await prisma.tableMeta.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: {
        records: { take: 5000 }, // P220: Lowered from 50K — prevents OOM on serverless
        views: true,
      },
    });

    if (!originalTable) {
      return { success: false, error: "Table not found" };
    }

    // Generate unique slug with "-copy" suffix
    let baseSlug = `${originalTable.slug}-copy`;
    let finalSlug = baseSlug;
    let counter = 0;

    while (true) {
      const existing = await prisma.tableMeta.findFirst({
        where: { slug: finalSlug, companyId: user.companyId },
      });
      if (!existing) break;
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
      if (counter > 100) throw new Error("Could not generate unique slug");
    }

    // Generate new name with " copy" suffix
    const newName = `${originalTable.name} copy${counter > 0 ? ` ${counter}` : ""}`;

    // Create the new table
    const newTable = await prisma.tableMeta.create({
      data: {
        name: newName,
        slug: finalSlug,
        schemaJson: originalTable.schemaJson as any,
        companyId: user.companyId,
        createdBy: user.id,
        categoryId: originalTable.categoryId,
        order: originalTable.order,
      },
    });

    // Duplicate all records
    if (originalTable.records.length > 0) {
      await prisma.record.createMany({
        data: originalTable.records.map((record) => ({
          tableId: newTable.id,
          companyId: user.companyId,
          data: record.data as any,
          createdBy: user.id,
        })),
      });
    }

    // Duplicate all views
    if (originalTable.views.length > 0) {
      await prisma.view.createMany({
        data: originalTable.views.map((view) => ({
          companyId: user.companyId,
          tableId: newTable.id,
          name: view.name,
          slug: view.slug,
          config: view.config as any,
          isEnabled: view.isEnabled,
          order: view.order,
        })),
      });
    }

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: newTable };
  } catch (error: any) {
    console.error("Error duplicating table:", error);
    return {
      success: false,
      error: "Failed to duplicate table: " + (error.message || "Unknown error"),
    };
  }
}
