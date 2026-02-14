import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

type TxClient = Prisma.TransactionClient;

/**
 * Clean up all dependent data for a set of record IDs before deletion.
 *
 * Handles:
 *  - File unlinking (set recordId = null so File rows aren't orphaned with dangling FK)
 *  - Attachment deletion
 *  - AuditLog unlinking (remove FK before record delete)
 *  - Finance cascade (delete synced finance records)
 *
 * Accepts an optional Prisma transaction client (`tx`). When called outside
 * a transaction, falls back to the global `prisma` client.
 */
export async function cleanupBeforeRecordDelete(
  recordIds: number[],
  opts: {
    companyId: number;
    tableId: number;
    financeSyncRuleIds?: number[];
    skipFinanceCascade?: boolean;
    tx?: TxClient;
  },
) {
  const db = opts.tx ?? prisma;

  // 1. Unlink files (set recordId = null — keeps File row + S3 blob intact)
  await db.file.updateMany({
    where: { recordId: { in: recordIds }, companyId: opts.companyId },
    data: { recordId: null },
  });

  // 2. Delete attachments (non-nullable FK → must delete before record)
  await db.attachment.deleteMany({
    where: { recordId: { in: recordIds }, record: { companyId: opts.companyId } },
  });

  // 3. Unlink audit logs (nullable FK, but remove reference before record delete)
  await db.auditLog.updateMany({
    where: { recordId: { in: recordIds }, companyId: opts.companyId },
    data: { recordId: null },
  });

  // 4. Cascade delete linked finance records (skip when caller already handled finance deletion)
  const ruleIds = opts.financeSyncRuleIds;
  if (ruleIds && ruleIds.length > 0 && !opts.skipFinanceCascade) {
    await db.financeRecord.deleteMany({
      where: {
        syncRuleId: { in: ruleIds },
        originId: { in: recordIds.map((id) => id.toString()) },
        companyId: opts.companyId,
      },
    });
  }
}

/**
 * Delete records by IDs with full cleanup + audit logging.
 *
 * Single-record convenience wrapper used by server action and API route.
 * For bulk operations, use `cleanupBeforeRecordDelete` directly inside
 * a batched transaction (see bulk-record-jobs.ts).
 */
export async function deleteRecordWithCleanup(
  recordId: number,
  opts: {
    companyId: number;
    tableId: number;
    userId: number;
    skipFinanceCascade?: boolean;
  },
) {
  // Fetch finance sync rules for cascade
  const syncRules = await prisma.financeSyncRule.findMany({
    where: {
      sourceType: "TABLE",
      sourceId: opts.tableId,
      companyId: opts.companyId,
    },
    select: { id: true },
  });

  const ruleIds = syncRules.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    await cleanupBeforeRecordDelete([recordId], {
      companyId: opts.companyId,
      tableId: opts.tableId,
      financeSyncRuleIds: ruleIds,
      skipFinanceCascade: opts.skipFinanceCascade,
      tx,
    });

    await tx.record.delete({
      where: { id: recordId, companyId: opts.companyId },
    });
  }, { timeout: 10000 });

  await createAuditLog(null, opts.userId, "DELETE", {
    previousRecordId: recordId,
  }, undefined, opts.companyId);
}
