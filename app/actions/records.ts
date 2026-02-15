"use server";

import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/permissions-server";
import { canWriteTable, canReadTable } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { deleteRecordWithCleanup } from "@/lib/record-cleanup";
import { withRetry } from "@/lib/db-retry";

export async function getRecordsByTableId(
  tableId: number,
  opts?: { cursor?: number; limit?: number },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!canReadTable(user, tableId)) {
      return { success: false, error: "אין לך הרשאה לצפות בטבלה זו" };
    }

    const pageSize = Math.min(opts?.limit ?? 100, 500);
    const cursor = opts?.cursor;

    // CRITICAL: Filter records by companyId for multi-tenancy
    const records = await withRetry(() => prisma.record.findMany({
      where: {
        tableId,
        companyId: user.companyId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ id: "desc" }],
      take: pageSize + 1, // +1 to detect next page
    }));

    const hasMore = records.length > pageSize;
    const page = hasMore ? records.slice(0, pageSize) : records;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { success: true, data: page, nextCursor, hasMore };
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

    // Verify table belongs to company and fetch name for automation event (single query)
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId },
      select: { id: true, name: true },
    }));
    if (!table) {
      return { success: false, error: "Table not found" };
    }

    const actualCreatedBy = user.id;

    const record = await withRetry(() => prisma.$transaction(async (tx) => {
      const created = await tx.record.create({
        data: {
          companyId: user.companyId,
          tableId,
          data: recordData as any,
          createdBy: actualCreatedBy,
          ...(createdAt && { createdAt: new Date(createdAt) }),
        },
      });

      await createAuditLog(created.id, actualCreatedBy, "CREATE", recordData, tx, user.companyId);

      return created;
    }, { maxWait: 5000, timeout: 10000 }));

    // Trigger automations for new record (async via Inngest)
    try {
      await inngest.send([
        {
          id: `new-record-${user.companyId}-${record.id}`,
          name: "automation/new-record",
          data: {
            tableId,
            tableName: table.name,
            recordId: record.id,
            companyId: user.companyId,
          },
        },
        {
          id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
          name: "dashboard/refresh-widgets",
          data: { companyId: user.companyId },
        },
      ]);
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
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const { data: recordData, updatedBy, createdAt } = data;
    const actualUpdatedBy = user.id;

    // Interactive transaction with FOR UPDATE lock to prevent lost-update race condition.
    // Replicates the proven pattern from tickets.ts.
    const { record, oldData } = await withRetry(() => prisma.$transaction(async (tx) => {
      // Acquire row-level lock to prevent concurrent modifications
      const locked: { id: number; tableId: number }[] = await tx.$queryRawUnsafe(
        `SELECT id, "tableId" FROM "Record" WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        recordId,
        user.companyId,
      );
      if (locked.length === 0) throw new Error("Record not found");

      const existingRecord = await tx.record.findUnique({
        where: { id: recordId, companyId: user.companyId },
      });
      if (!existingRecord) throw new Error("Record not found");

      if (!canWriteTable(user, existingRecord.tableId)) {
        throw new Error("אין לך הרשאה לערוך רשומות בטבלה זו");
      }

      // Merge new data with existing data inside the lock to prevent lost updates.
      // This is CRITICAL for automations that add data (like duration_status_change)
      const existingData = (existingRecord.data as Record<string, unknown>) || {};
      const mergedData = {
        ...existingData,
        ...recordData,
      };

      const updated = await tx.record.update({
        where: { id: recordId, companyId: user.companyId },
        data: {
          data: mergedData as any,
          updatedBy: actualUpdatedBy,
          ...(createdAt && { createdAt: new Date(createdAt) }),
        },
      });

      await createAuditLog(updated.id, actualUpdatedBy, "UPDATE", recordData, tx, user.companyId);

      return { record: updated, oldData: existingRecord.data as Record<string, unknown> };
    }, { maxWait: 5000, timeout: 10000 }));

    // Trigger Automation (async via Inngest)
    try {
      await inngest.send([
        {
          id: `record-update-${user.companyId}-${record.id}-${Math.floor(Date.now() / 1000)}`,
          name: "automation/record-update",
          data: {
            tableId: record.tableId,
            recordId: record.id,
            oldData,
            newData: recordData,
            companyId: user.companyId,
          },
        },
        {
          id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
          name: "dashboard/refresh-widgets",
          data: { companyId: user.companyId },
        },
      ]);
    } catch (autoError) {
      console.error(`[Records] Failed to send automation event:`, autoError);
    }

    revalidatePath(`/tables/${record.tableId}`);
    revalidatePath("/");

    return { success: true, data: record };
  } catch (error: any) {
    if (error?.message === "אין לך הרשאה לערוך רשומות בטבלה זו") {
      return { success: false, error: error.message };
    }
    console.error("Error updating record:", error);
    return { success: false, error: "Failed to update record" };
  }
}

export async function deleteRecord(recordId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // P138: Add companyId to prevent cross-tenant record deletion
    const existingRecord = await withRetry(() => prisma.record.findFirst({
      where: { id: recordId, companyId: user.companyId },
      select: { tableId: true },
    }));

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

    await deleteRecordWithCleanup(recordId, {
      companyId: user.companyId,
      tableId: existingRecord.tableId,
      userId: user.id,
    });

    // Trigger dashboard cache refresh
    try {
      await inngest.send({
        id: `dash-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId: user.companyId },
      });
    } catch (e) {
      console.error("[Records] Failed to send dashboard refresh:", e);
    }

    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting record:", error);
    return { success: false, error: "Failed to delete record" };
  }
}

export async function bulkDeleteRecords(recordIds: number[]) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const validIds = recordIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      return { success: true };
    }

    if (validIds.length > 5000) {
      return { success: false, error: "Cannot delete more than 5000 records at once" };
    }

    // Verify all records belong to the same table and check permission
    const distinctTables = await withRetry(() => prisma.record.groupBy({
      by: ["tableId"],
      where: { id: { in: validIds }, companyId: user.companyId },
    }));

    if (distinctTables.length === 0) {
      return { success: true };
    }

    if (distinctTables.length > 1) {
      return { success: false, error: "כל הרשומות חייבות להיות מאותה טבלה" };
    }

    const tableId = distinctTables[0].tableId;

    if (!canWriteTable(user, tableId)) {
      return {
        success: false,
        error: "אין לך הרשאה למחוק רשומות מטבלה זו",
      };
    }

    // Offload the heavy work (finance cascade + delete + audit) to Inngest
    await inngest.send({
      id: `bulk-delete-${user.companyId}-${tableId}-${Math.floor(Date.now() / 1000)}`,
      name: "records/bulk-delete",
      data: {
        recordIds: validIds,
        companyId: user.companyId,
        tableId,
        userId: user.id,
      },
    });

    // No revalidatePath here — the Inngest job runs async so records aren't
    // deleted yet. The UI already does optimistic removal on the client side.

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
