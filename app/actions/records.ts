"use server";

import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/permissions-server";
import { canWriteTable, canReadTable } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";

export async function getRecordsByTableId(tableId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לצפות בטבלה זו" };
    }

    // CRITICAL: Filter records by companyId for multi-tenancy
    const records = await prisma.record.findMany({
      where: {
        tableId,
        companyId: user.companyId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!canWriteTable(user, tableId)) {
      return {
        success: false,
        error: "אין לך הרשאה לכתוב לטבלה זו",
      };
    }

    // Use the authenticated user's ID as createdBy if not explicitly provided (or force it?)
    // For now, defaulting to authenticated user if createdBy is not passed, or verifying if it matches?
    // Let's rely on authenticated user for `createdBy` field to prevent spoofing,
    // unless it's a system action (but this is a server action called by client usually).
    const actualCreatedBy = user.id;

    const record = await prisma.record.create({
      data: {
        companyId: user.companyId,
        tableId,
        data: recordData as any,
        createdBy: actualCreatedBy,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(record.id, actualCreatedBy, "CREATE", recordData);

    // Trigger automations for new record (async via Inngest)
    try {
      const table = await prisma.tableMeta.findUnique({
        where: { id: tableId },
        select: { name: true },
      });
      await inngest.send({
        name: "automation/new-record",
        data: {
          tableId,
          tableName: table?.name || "Unknown Table",
          recordId: record.id,
          companyId: user.companyId,
        },
      });
    } catch (autoError) {
      console.error(`[Records] Failed to send automation event:`, autoError);
    }

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
  },
) {
  console.log(`[Records] updateRecord called for Record ID: ${recordId}`);
  try {
    // Fetch existing record to check permissions AND for automation diffs
    const existingRecord = await prisma.record.findUnique({
      where: { id: recordId },
    });

    if (!existingRecord) {
      console.log(`[Records] Record ${recordId} not found`);
      return { success: false, error: "Record not found" };
    }

    const { data: recordData, updatedBy, createdAt } = data;

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!canWriteTable(user, existingRecord.tableId)) {
      return {
        success: false,
        error: "אין לך הרשאה לערוך רשומות בטבלה זו",
      };
    }

    const actualUpdatedBy = user.id;

    // Merge new data with existing data to ensure we don't lose fields if recordData is partial
    // This is CRITICAL for automations that add data (like duration_status_change)
    const existingData = (existingRecord.data as Record<string, unknown>) || {};
    const mergedData = {
      ...existingData,
      ...recordData,
    };

    console.log(
      `[Records] Updating record ${recordId}. Keys in payload: ${Object.keys(
        recordData,
      ).join(", ")}`,
    );

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        data: mergedData as any,
        updatedBy: actualUpdatedBy,
        ...(createdAt && { createdAt: new Date(createdAt) }),
      },
    });

    await createAuditLog(record.id, actualUpdatedBy, "UPDATE", recordData);

    // Trigger Automation (async via Inngest)
    console.log(`[Records] Sending automation event for Table ${record.tableId}`);
    try {
      await inngest.send({
        name: "automation/record-update",
        data: {
          tableId: record.tableId,
          recordId: record.id,
          oldData: existingRecord.data as Record<string, unknown>,
          newData: recordData,
          companyId: user.companyId,
        },
      });
    } catch (autoError) {
      console.error(`[Records] Failed to send automation event:`, autoError);
    }

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
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // We need to fetch the record first to know the tableId
    const existingRecord = await prisma.record.findUnique({
      where: { id: recordId },
      select: { tableId: true },
    });

    if (!existingRecord) {
      // Record already deleted or doesn't exist
      return { success: true };
    }

    if (!canWriteTable(user, existingRecord.tableId)) {
      return {
        success: false,
        error: "אין לך הרשאה למחוק רשומות מטבלה זו",
      };
    }

    // Check write permissions
    /* Legacy check removed */

    await prisma.record.delete({
      where: { id: recordId },
    });

    // CASCADE DELETE TO FINANCE
    try {
      // Find if this record was synced to finance
      // We look for any SyncRule of type TABLE where sourceId is THIS table
      // But simpler: just delete any finance record with originId == recordId AND syncRule.sourceType == TABLE
      // Since originId isn't unique across all rules, we should probably check syncRule source.

      // Find sync rules for this table
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: existingRecord.tableId },
      });

      if (syncRules.length > 0) {
        const ruleIds = syncRules.map((r) => r.id);
        await prisma.financeRecord.deleteMany({
          where: {
            syncRuleId: { in: ruleIds },
            originId: recordId.toString(),
          },
        });
        console.log(
          `[Records] Cascaded delete to Finance Records for origin #${recordId}`,
        );
      }
    } catch (e) {
      console.error("Failed to cascade delete to finance:", e);
    }

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
  deletedBy?: number,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // If we have deletedBy, check permissions for the first record
    if (recordIds.length > 0) {
      const existingRecord = await prisma.record.findUnique({
        where: { id: recordIds[0] },
        select: { tableId: true },
      });

      if (existingRecord) {
        if (!canWriteTable(user, existingRecord.tableId)) {
          return {
            success: false,
            error: "אין לך הרשאה למחוק רשומות מטבלה זו",
          };
        }
      }
    }

    // CASCADE DELETE TO FINANCE
    try {
      if (recordIds.length > 0) {
        // We assume all records belong to the same table for bulk ops usually,
        // or we find the tableId from the first one as done above.
        const firstRec = await prisma.record.findUnique({
          where: { id: recordIds[0] },
          select: { tableId: true },
        });

        if (firstRec) {
          const syncRules = await prisma.financeSyncRule.findMany({
            where: { sourceType: "TABLE", sourceId: firstRec.tableId },
          });

          if (syncRules.length > 0) {
            const ruleIds = syncRules.map((r) => r.id);
            await prisma.financeRecord.deleteMany({
              where: {
                syncRuleId: { in: ruleIds },
                originId: { in: recordIds.map((id) => id.toString()) },
              },
            });
            console.log(
              `[Records] Bulk cascade delete to Finance Records for ${recordIds.length} items`,
            );
          }
        }
      }
    } catch (e) {
      console.error("Failed to cascade bulk delete to finance:", e);
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
    revalidatePath("/finance");
    revalidatePath("/finance/income-expenses");

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
