import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { buildUploadThingUrl } from "@/lib/uploadthing-utils";
import { processImportFile } from "@/lib/import-service";
import { createAuditLogsBatch } from "@/lib/audit";

// Batch size for CSV parse callbacks
const PARSE_BATCH_SIZE = 300;
// Max records per database transaction
const TRANSACTION_BATCH_SIZE = 100;

/**
 * Coerce raw CSV string values to their schema-defined types.
 */
function coerceRecordData(recordData: any, schema: any[]): any {
  const typedData: any = { ...recordData };
  for (const field of schema) {
    if (typedData[field.name] == null) continue;
    if (field.type === "number") {
      const num = Number(typedData[field.name]);
      if (!isNaN(num)) typedData[field.name] = num;
    } else if (field.type === "boolean") {
      const val = String(typedData[field.name]).toLowerCase();
      typedData[field.name] = val === "true" || val === "1" || val === "yes";
    }
  }
  return typedData;
}

/**
 * Background job for processing CSV/TXT imports.
 *
 * Architecture (optimized):
 *  Step 1 — Load metadata (job + table + schema).
 *  Step 2 — Stream-parse the CSV and insert records directly into the DB in
 *           batched transactions as they are parsed. This avoids storing
 *           all parsed records in the ImportJob.summary JSONB column and
 *           eliminates the O(N²) re-read that occurred when each batch step
 *           re-loaded the entire summary.
 *  Step 3 — Finalize (mark job as IMPORTED).
 */
export const processImportJob = inngest.createFunction(
  {
    id: "process-import-job",
    name: "Process Import Job",
    retries: 3,
    timeouts: { finish: "300s" },
    // Only one import per table at a time to prevent conflicts
    concurrency: {
      limit: 1,
      key: "event.data.tableId",
    },
    // Handle failures - mark job as failed
    onFailure: async ({ event, error }) => {
      const { importJobId } = event.data.event.data;
      console.error(`Import job ${importJobId} failed:`, error);

      try {
        await prisma.importJob.update({
          where: { id: importJobId, companyId: event.data.event.data.companyId },
          data: {
            status: "FAILED",
            summary: {
              error: error.message || "הייבוא נכשל",
              failedAt: new Date().toISOString(),
            },
          },
        });
      } catch (updateError) {
        console.error("Failed to update job status:", updateError);
      }
    },
  },
  { event: "import/job.started" },
  async ({ event, step, logger }) => {
    const { importJobId, tableId, userId, companyId } = event.data;

    logger.info("Starting import job processing", { importJobId, tableId });

    // Step 1: Load job and table metadata
    const { job, table, schema } = await step.run("load-metadata", async () => {
      // SECURITY: Filter by companyId to prevent cross-tenant access
      const job = await prisma.importJob.findFirst({
        where: { id: importJobId, companyId },
      });

      if (!job) {
        throw new Error(`Import job ${importJobId} not found`);
      }

      if (job.status === "IMPORTED") {
        throw new Error("Job already imported");
      }

      // SECURITY: Filter by companyId to prevent cross-tenant access
      const table = await prisma.tableMeta.findFirst({
        where: { id: tableId, companyId },
      });

      if (!table) {
        throw new Error(`Table ${tableId} not found`);
      }

      let schema: any[] = [];
      try {
        if (typeof table.schemaJson === "string") {
          schema = JSON.parse(table.schemaJson);
        } else {
          schema = (table.schemaJson as any[]) || [];
        }
      } catch {
        throw new Error("Invalid table schema");
      }

      // Update status to IMPORTING
      await prisma.importJob.update({
        where: { id: importJobId, companyId },
        data: { status: "IMPORTING" },
      });

      return { job, table, schema };
    });

    // Step 2: Stream-parse CSV and insert directly into DB in batched transactions.
    // Records are inserted as they are parsed — never stored in the summary JSONB.
    const { insertedCount, parseSummary } = await step.run("parse-and-insert", async () => {
      const secureUrl = buildUploadThingUrl(job.fileKey);
      logger.info("Fetching file from storage", { url: secureUrl });

      const fileRes = await fetch(secureUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!fileRes.ok || !fileRes.body) {
        throw new Error("Failed to download file from storage");
      }

      const MAX_IMPORT_RECORDS = 50000;
      let totalParsed = 0;
      let totalInserted = 0;
      // Buffer for accumulating records before flushing to DB
      let pendingRecords: any[] = [];

      /** Flush the pending buffer into the DB via a batched transaction. */
      const flushBatch = async (batch: any[]) => {
        if (batch.length === 0) return;

        const inserted = await prisma.$transaction(
          async (tx) => {
            const recordsData = batch.map((recordData) => ({
              tableId: table.id,
              companyId,
              data: coerceRecordData(recordData, schema),
              createdBy: userId,
            }));

            // Track max ID before insert to accurately identify new records
            const maxIdResult = await tx.$queryRaw<[{ max: number | null }]>`
              SELECT MAX("id") as max FROM "Record" WHERE "tableId" = ${table.id} AND "companyId" = ${companyId}
            `;
            const maxIdBefore = maxIdResult[0].max ?? 0;

            const result = await tx.record.createMany({ data: recordsData });

            // Query back created record IDs using the tracked max ID boundary
            const createdRecords = await tx.record.findMany({
              where: {
                tableId: table.id,
                companyId,
                id: { gt: maxIdBefore },
              },
              orderBy: { id: "asc" },
              take: result.count,
              select: { id: true },
            });

            if (createdRecords.length > 0) {
              await createAuditLogsBatch(
                createdRecords.map((record) => ({
                  recordId: record.id,
                  userId,
                  action: "CREATE",
                  companyId,
                })),
                tx,
              );
            }

            return result.count;
          },
          { maxWait: 5000, timeout: 30000 },
        );

        totalInserted += inserted;

        // Update progress periodically (every flush)
        const progress = Math.min(99, Math.round((totalInserted / Math.max(totalParsed, 1)) * 100));
        await prisma.importJob.update({
          where: { id: importJobId, companyId },
          data: {
            summary: {
              progress,
              insertedCount: totalInserted,
            } as any,
          },
        });
      };

      // Stream-parse callback: accumulate records, flush when buffer is full
      const onBatch = async (parsedBatch: any[]) => {
        totalParsed += parsedBatch.length;
        if (totalParsed > MAX_IMPORT_RECORDS) {
          throw new Error(`Import exceeds maximum of ${MAX_IMPORT_RECORDS} records`);
        }

        pendingRecords.push(...parsedBatch);

        // Flush in TRANSACTION_BATCH_SIZE chunks
        while (pendingRecords.length >= TRANSACTION_BATCH_SIZE) {
          const chunk = pendingRecords.splice(0, TRANSACTION_BATCH_SIZE);
          await flushBatch(chunk);
        }
      };

      const result = await processImportFile(
        fileRes.body,
        schema,
        false,
        onBatch,
        PARSE_BATCH_SIZE,
      );

      if (result.summary.errors.length > 0) {
        const critical = result.summary.errors.find((e) => e.line === 0);
        if (critical) {
          throw new Error(critical.message);
        }
      }

      // Flush any remaining records in the buffer
      if (pendingRecords.length > 0) {
        await flushBatch(pendingRecords);
        pendingRecords = [];
      }

      if (totalInserted === 0 && result.summary.totalRows > 0) {
        throw new Error("לא נמצאו רשומות תקינות לייבוא");
      }

      logger.info("File parsed and inserted successfully", {
        totalRows: result.summary.totalRows,
        validRows: totalParsed,
        invalidRows: result.summary.invalidRows,
        insertedCount: totalInserted,
      });

      return { insertedCount: totalInserted, parseSummary: result.summary };
    });

    // Step 3: Mark job as complete
    await step.run("finalize-job", async () => {
      await prisma.importJob.update({
        where: { id: importJobId, companyId },
        data: {
          status: "IMPORTED",
          summary: {
            ...(parseSummary as any),
            progress: 100,
            insertedCount,
            completedAt: new Date().toISOString(),
          },
        },
      });

      logger.info("Import job completed successfully", {
        importJobId,
        insertedCount,
      });
    });

    return {
      success: true,
      insertedCount,
      importJobId,
    };
  },
);
