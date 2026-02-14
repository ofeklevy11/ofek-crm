import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { buildUploadThingUrl } from "@/lib/uploadthing-utils";
import { processImportFile } from "@/lib/import-service";
import { createAuditLogsBatch } from "@/lib/audit";

// Batch size for processing records - small enough to avoid transaction timeouts
const BATCH_SIZE = 300;
// Max records per database transaction
const TRANSACTION_BATCH_SIZE = 100;

/**
 * Background job for processing CSV/TXT imports.
 *
 * This function runs outside of the HTTP request lifecycle, allowing for:
 * - No HTTP timeout constraints
 * - Automatic retries on failure
 * - Progress tracking via ImportJob status
 * - Smaller, more reliable database transactions
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

    // Step 2: Fetch, parse, and store record count
    // Records are stored in the ImportJob summary to avoid Inngest step output size limits (Issue 29)
    const { totalValid, summary: parseSummary } = await step.run("fetch-and-parse-file", async () => {
      const secureUrl = buildUploadThingUrl(job.fileKey);
      logger.info("Fetching file from storage", { url: secureUrl });

      const fileRes = await fetch(secureUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!fileRes.ok || !fileRes.body) {
        throw new Error("Failed to download file from storage");
      }

      const MAX_IMPORT_RECORDS = 50000;
      const validRecords: any[] = [];

      const onBatch = async (batch: any[]) => {
        validRecords.push(...batch);
        if (validRecords.length > MAX_IMPORT_RECORDS) {
          throw new Error(`Import exceeds maximum of ${MAX_IMPORT_RECORDS} records`);
        }
      };

      const result = await processImportFile(
        fileRes.body,
        schema,
        false,
        onBatch,
        BATCH_SIZE,
      );

      if (result.summary.errors.length > 0) {
        const critical = result.summary.errors.find((e) => e.line === 0);
        if (critical) {
          throw new Error(critical.message);
        }
      }

      if (validRecords.length === 0 && result.summary.totalRows > 0) {
        throw new Error("לא נמצאו רשומות תקינות לייבוא");
      }

      // Store parsed records in ImportJob summary to avoid passing large data between steps
      await prisma.importJob.update({
        where: { id: importJobId, companyId },
        data: {
          summary: {
            ...result.summary,
            parsedRecords: validRecords,
          } as any,
        },
      });

      logger.info("File parsed successfully", {
        totalRows: result.summary.totalRows,
        validRows: validRecords.length,
        invalidRows: result.summary.invalidRows,
      });

      return { totalValid: validRecords.length, summary: result.summary };
    });

    // Step 3: Process records in per-batch steps for Inngest durability (Issue 24)
    // Each batch is its own step — if batch N fails and retries, batches 0..N-1 are already checkpointed
    const totalBatches = Math.ceil(totalValid / TRANSACTION_BATCH_SIZE);
    let totalInserted = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchInserted = await step.run(`insert-batch-${batchIndex}`, async () => {
        // Re-read parsed records from DB for this batch slice
        // SECURITY: Filter by companyId to prevent cross-tenant access
        const currentJob = await prisma.importJob.findFirst({
          where: { id: importJobId, companyId },
        });
        const allRecords = (currentJob?.summary as any)?.parsedRecords || [];
        const start = batchIndex * TRANSACTION_BATCH_SIZE;
        const batch = allRecords.slice(start, start + TRANSACTION_BATCH_SIZE);
        if (batch.length === 0) return 0;

        let inserted: number;
        try {
          inserted = await prisma.$transaction(
            async (tx) => {
              // Prepare data with proper types (Issue 32: use createMany)
              const recordsData = batch.map((recordData: any) => {
                const typedData: any = { ...recordData };
                schema.forEach((field: any) => {
                  if (typedData[field.name]) {
                    if (field.type === "number") {
                      const num = Number(typedData[field.name]);
                      if (!isNaN(num)) typedData[field.name] = num;
                    } else if (field.type === "boolean") {
                      const val = String(typedData[field.name]).toLowerCase();
                      typedData[field.name] =
                        val === "true" || val === "1" || val === "yes";
                    }
                  }
                });
                return {
                  tableId: table.id,
                  companyId: companyId,
                  data: typedData,
                  createdBy: userId,
                };
              });

              // Bulk insert with createMany
              const result = await tx.record.createMany({ data: recordsData });

              // Query back created record IDs for audit logs
              const createdRecords = await tx.record.findMany({
                where: {
                  tableId: table.id,
                  companyId: companyId,
                  createdBy: userId,
                },
                orderBy: { id: "desc" },
                take: result.count,
                select: { id: true, data: true },
              });

              if (createdRecords.length > 0) {
                await createAuditLogsBatch(
                  createdRecords.map((record) => ({
                    recordId: record.id,
                    userId: userId,
                    action: "CREATE",
                    diffJson: record.data,
                    companyId,
                  })),
                  tx,
                );
              }

              return result.count;
            },
            {
              maxWait: 5000,
              timeout: 30000,
            },
          );
        } catch (err: any) {
          // BB15: Update progress on failure so UI doesn't show frozen progress bar
          await prisma.importJob.update({
            where: { id: importJobId, companyId },
            data: {
              summary: {
                ...(parseSummary as any),
                progress: Math.round((start / totalValid) * 100),
                insertedCount: totalInserted || 0,
                lastError: `Batch ${batchIndex} failed: ${err.message}`,
              },
            },
          });
          throw err;
        }

        // Update progress
        const progress = Math.round(((start + batch.length) / totalValid) * 100);
        await prisma.importJob.update({
          where: { id: importJobId, companyId },
          data: {
            summary: {
              ...(parseSummary as any),
              progress,
              insertedCount: (totalInserted || 0) + inserted,
            },
          },
        });

        return inserted;
      });

      totalInserted += batchInserted;
      logger.info(`Batch ${batchIndex + 1}/${totalBatches} completed`, {
        inserted: totalInserted,
      });
    }

    const insertedCount = totalInserted;

    // Step 4: Mark job as complete
    await step.run("finalize-job", async () => {
      await prisma.importJob.update({
        where: { id: importJobId, companyId },
        data: {
          status: "IMPORTED",
          summary: {
            ...(job.summary as any),
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
