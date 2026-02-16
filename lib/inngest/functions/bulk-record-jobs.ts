import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { createAuditLogsBatch } from "@/lib/audit";
import { cleanupBeforeRecordDelete } from "@/lib/record-cleanup";
import { createLogger } from "@/lib/logger";

const log = createLogger("BulkRecordJobs");

/** Process record IDs in chunks to avoid query-size limits */
const BATCH_SIZE = 300;

/**
 * Background job for bulk-deleting records.
 *
 * Handles:
 *  - File unlinking (via shared cleanup utility)
 *  - Attachment cleanup
 *  - AuditLog unlinking (remove FK before record delete)
 *  - Finance cascade (delete synced finance records)
 *  - Batched record deletion with companyId + tableId guard
 *  - Batched audit log creation
 *  - Dashboard widget refresh after completion
 *
 * Each batch runs inside a `prisma.$transaction()` for atomicity.
 * Concurrency is limited per company so a large delete doesn't starve
 * other tenants.
 */
export const processBulkDeleteRecords = inngest.createFunction(
  {
    id: "process-bulk-delete-records",
    name: "Bulk Delete Records",
    retries: 2,
    timeouts: { finish: "120s" },
    concurrency: {
      limit: 2,
      key: "event.data.companyId",
    },
    onFailure: async ({ error, event }) => {
      const { companyId, tableId, recordIds } = event.data.event.data as {
        companyId: number;
        tableId: number;
        recordIds: number[];
      };
      log.error("Bulk delete failed", { companyId, tableId, recordCount: recordIds?.length ?? 0, error: error.message });
    },
  },
  { event: "records/bulk-delete" },
  async ({ event, step }) => {
    const { recordIds, companyId, tableId, userId } = event.data as {
      recordIds: number[];
      companyId: number;
      tableId: number;
      userId?: number;
    };

    const total = recordIds.length;
    let deletedCount = 0;

    // Fetch finance sync rules once (they don't change between batches)
    const syncRules = await step.run("fetch-sync-rules", async () => {
      return prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, companyId },
        select: { id: true },
      });
    });

    const ruleIds = syncRules.map((r) => r.id);

    // Process in batches to stay within DB query limits
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = recordIds.slice(i, i + BATCH_SIZE);

      const batchCount = await step.run(`delete-batch-${i}`, async () => {
        return prisma.$transaction(async (tx) => {
          // Cleanup files, attachments, audit logs, finance records
          await cleanupBeforeRecordDelete(batch, {
            companyId,
            tableId,
            financeSyncRuleIds: ruleIds,
            tx,
          });

          // Delete the records (companyId + tableId guard for multi-tenancy & cross-table protection)
          const result = await tx.record.deleteMany({
            where: {
              id: { in: batch },
              companyId,
              tableId,
            },
          });

          // Audit logs inside transaction for atomicity — if this fails, the delete is rolled back
          await createAuditLogsBatch(
            batch.map((id) => ({
              recordId: null,
              userId: userId ?? null,
              action: "DELETE (BULK)",
              diffJson: { previousRecordId: id },
              companyId,
            })),
            tx,
          );

          return result.count;
        }, { timeout: 30000 });
      });

      deletedCount += batchCount;
    }

    // Refresh dashboard widgets after all batches complete
    await step.run("refresh-dashboard", async () => {
      await inngest.send({
        id: `dash-refresh-${companyId}-${Math.floor(Date.now() / 5000)}`,
        name: "dashboard/refresh-widgets",
        data: { companyId },
      });
    });

    return { success: true, deletedCount, total };
  },
);
