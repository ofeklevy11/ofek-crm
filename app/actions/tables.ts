"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getTables() {
  try {
    const tables = await prisma.tableMeta.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: tables };
  } catch (error) {
    console.error("Error fetching tables:", error);
    return { success: false, error: "Failed to fetch tables" };
  }
}

export async function getTableById(id: number) {
  try {
    const table = await prisma.tableMeta.findUnique({
      where: { id },
    });

    if (!table) {
      return { success: false, error: "Table not found" };
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
  createdBy: number;
  categoryId?: number;
}) {
  try {
    const { name, slug, schemaJson, createdBy, categoryId } = data;

    if (!name || !slug || !createdBy) {
      return { success: false, error: "Missing required fields" };
    }

    const table = await prisma.tableMeta.create({
      data: {
        name,
        slug,
        schemaJson: (schemaJson || {}) as any,
        createdBy: Number(createdBy),
        categoryId: categoryId ? Number(categoryId) : undefined,
      },
    });

    revalidatePath("/");
    revalidatePath("/tables");

    return { success: true, data: table };
  } catch (error) {
    console.error("Error creating table:", error);
    return { success: false, error: "Failed to create table" };
  }
}

export async function updateTable(
  id: number,
  data: {
    name?: string;
    slug?: string;
    schemaJson?: Record<string, unknown>;
    categoryId?: number | null;
  }
) {
  try {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.schemaJson !== undefined) updateData.schemaJson = data.schemaJson;
    if (data.categoryId !== undefined) {
      updateData.categoryId = data.categoryId;
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
