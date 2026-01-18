"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canManageTables, hasUserFlag } from "@/lib/permissions";

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

    // Ensure slug uniqueness
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

    const table = await prisma.tableMeta.create({
      data: {
        name,
        slug: finalSlug,
        schemaJson: (schemaJson || {}) as any,
        companyId: user.companyId,
        createdBy: user.id,
        categoryId: categoryId ? Number(categoryId) : undefined,
      },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: table };
  } catch (error: any) {
    // Check if it's a unique constraint violation just in case our check missed it (race condition)
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

    const table = await prisma.tableMeta.update({
      where: { id },
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

    await prisma.tableMeta.delete({
      where: { id },
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
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        records: true,
      },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    const user = await getCurrentUser();
    if (!user || !canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לייצא טבלה זו" };
    }

    // Check if user has export permission
    if (!hasUserFlag(user, "canExportTables")) {
      return { success: false, error: "אין לך הרשאה לייצא נתונים" };
    }

    return { success: true, data: table };
  } catch (error) {
    console.error("Error exporting table:", error);
    return { success: false, error: "Failed to export table" };
  }
}

export async function searchInTable(tableId: number, searchTerm: string) {
  try {
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
    }

    const user = await getCurrentUser();
    if (!user || !canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לחפש בטבלה זו" };
    }

    // Check if user has search permission
    if (!hasUserFlag(user, "canSearchTables")) {
      return { success: false, error: "אין לך הרשאה לחפש בטבלאות" };
    }

    const records = await prisma.record.findMany({
      where: {
        tableId,
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter records based on search term
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

    const transaction = updates.map((update) =>
      prisma.tableMeta.update({
        where: { id: update.id },
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
        records: true,
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
