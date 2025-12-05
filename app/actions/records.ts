"use server";

import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { getUserById, canWriteTable } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function getRecordsByTableId(tableId: number) {
  try {
    const records = await prisma.record.findMany({
      where: { tableId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: records };
  } catch (error) {
    console.error("Error fetching records:", error);
    return { success: false, error: "Failed to fetch records" };
  }
}

export async function createRecord(data: {
  tableId: number;
  data: Record<string, unknown>;
  createdBy?: number;
  createdAt?: string;
}) {
  try {
    const { tableId, data: recordData, createdBy, createdAt } = data;

    // Check write permissions
    if (createdBy) {
      const user = await getUserById(Number(createdBy));
      if (!user || !canWriteTable(user, tableId)) {
        return {
          success: false,
          error: "You don't have permission to write to this table",
        };
      }
    }

    const record = await prisma.record.create({
      data: {
        tableId,
        data: recordData as any,
        createdBy: createdBy ? Number(createdBy) : null,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(
      record.id,
      createdBy ? Number(createdBy) : null,
      "CREATE",
      recordData
    );

    revalidatePath(`/tables/${tableId}`);
    revalidatePath("/");

    return { success: true, data: record };
  } catch (error) {
    console.error("Error creating record:", error);
    return { success: false, error: "Failed to create record" };
  }
}

export async function updateRecord(
  recordId: number,
  data: {
    data: Record<string, unknown>;
    updatedBy?: number;
    createdAt?: string;
  }
) {
  try {
    const { data: recordData, updatedBy, createdAt } = data;

    // Check write permissions
    if (updatedBy) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordId },
        select: { tableId: true },
      });

      if (existingRecord) {
        const user = await getUserById(Number(updatedBy));
        if (!user || !canWriteTable(user, existingRecord.tableId)) {
          return {
            success: false,
            error: "You don't have permission to write to this table",
          };
        }
      }
    }

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        data: recordData as any,
        updatedBy: updatedBy ? Number(updatedBy) : null,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(
      record.id,
      updatedBy ? Number(updatedBy) : null,
      "UPDATE",
      recordData
    );

    revalidatePath(`/tables/${record.tableId}`);
    revalidatePath("/");

    return { success: true, data: record };
  } catch (error) {
    console.error("Error updating record:", error);
    return { success: false, error: "Failed to update record" };
  }
}

export async function deleteRecord(recordId: number, deletedBy?: number) {
  try {
    // Check write permissions
    if (deletedBy) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordId },
        select: { tableId: true },
      });

      if (existingRecord) {
        const user = await getUserById(Number(deletedBy));
        if (!user || !canWriteTable(user, existingRecord.tableId)) {
          return {
            success: false,
            error: "You don't have permission to write to this table",
          };
        }

        await prisma.record.delete({
          where: { id: recordId },
        });

        await createAuditLog(recordId, null, "DELETE");

        revalidatePath(`/tables/${existingRecord.tableId}`);
        revalidatePath("/");

        return { success: true };
      }
    }

    await prisma.record.delete({
      where: { id: recordId },
    });

    await createAuditLog(recordId, null, "DELETE");

    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting record:", error);
    return { success: false, error: "Failed to delete record" };
  }
}

export async function bulkDeleteRecords(
  recordIds: number[],
  deletedBy?: number
) {
  try {
    // If we have deletedBy, check permissions for the first record
    if (deletedBy && recordIds.length > 0) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordIds[0] },
        select: { tableId: true },
      });

      if (existingRecord) {
        const user = await getUserById(Number(deletedBy));
        if (!user || !canWriteTable(user, existingRecord.tableId)) {
          return {
            success: false,
            error: "You don't have permission to write to this table",
          };
        }
      }
    }

    await prisma.record.deleteMany({
      where: {
        id: {
          in: recordIds,
        },
      },
    });

    for (const recordId of recordIds) {
      await createAuditLog(recordId, null, "DELETE");
    }

    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error bulk deleting records:", error);
    return { success: false, error: "Failed to bulk delete records" };
  }
}

export async function uploadAttachment(recordId: number, file: FormData) {
  try {
    // This is a placeholder - you'll need to implement file upload logic
    // based on your file storage solution (e.g., S3, local storage, etc.)
    return {
      success: true,
      message: "File upload functionality to be implemented",
    };
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return { success: false, error: "Failed to upload attachment" };
  }
}
