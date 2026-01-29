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
          where: { id: importJobId },
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
      const job = await prisma.importJob.findUnique({
        where: { id: importJobId },
      });

      if (!job) {
        throw new Error(`Import job ${importJobId} not found`);
      }

      if (job.status === "IMPORTED") {
        throw new Error("Job already imported");
      }

      const table = await prisma.tableMeta.findUnique({
        where: { id: tableId },
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
        where: { id: importJobId },
        data: { status: "IMPORTING" },
      });

      return { job, table, schema };
    });

    // Step 2: Fetch and parse the file
    const allValidRecords = await step.run("fetch-and-parse-file", async () => {
      const secureUrl = buildUploadThingUrl(job.fileKey);
      logger.info("Fetching file from storage", { url: secureUrl });

      const fileRes = await fetch(secureUrl);
      if (!fileRes.ok || !fileRes.body) {
        throw new Error("Failed to download file from storage");
      }

      // Parse the file and collect all valid records
      // We do this OUTSIDE of transactions to avoid timeout issues
      const validRecords: any[] = [];

      const onBatch = async (batch: any[]) => {
        // Just collect records, we'll process them in batches later
        validRecords.push(...batch);
      };

      const result = await processImportFile(
        fileRes.body,
        schema,
        false,
        onBatch,
        BATCH_SIZE,
      );

      // Validate headers on first batch would have happened in processImportFile
      // Check for critical errors
      if (result.summary.errors.length > 0) {
        const critical = result.summary.errors.find((e) => e.line === 0);
        if (critical) {
          throw new Error(critical.message);
        }
      }

      // Store the validation summary for later
      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          summary: result.summary as any,
        },
      });

      if (validRecords.length === 0 && result.summary.totalRows > 0) {
        throw new Error("לא נמצאו רשומות תקינות לייבוא");
      }

      logger.info("File parsed successfully", {
        totalRows: result.summary.totalRows,
        validRows: validRecords.length,
        invalidRows: result.summary.invalidRows,
      });

      return validRecords;
    });

    // Step 3: Process records in batches with separate transactions
    const insertedCount = await step.run("insert-records", async () => {
      let totalInserted = 0;
      const schemaMap = new Map<string, any>();
      schema.forEach((f: any) => schemaMap.set(f.name, f));

      // Split records into smaller batches for transactions
      for (let i = 0; i < allValidRecords.length; i += TRANSACTION_BATCH_SIZE) {
        const batch = allValidRecords.slice(i, i + TRANSACTION_BATCH_SIZE);

        try {
          await prisma.$transaction(
            async (tx) => {
              // Prepare data with proper types
              const recordsToCreate = batch.map((recordData: any) => {
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
                return typedData;
              });

              // Create records
              const createdRecords = await Promise.all(
                recordsToCreate.map((data: any) =>
                  tx.record.create({
                    data: {
                      tableId: table.id,
                      companyId: companyId,
                      data,
                      createdBy: userId,
                    },
                  }),
                ),
              );

              totalInserted += createdRecords.length;

              // Create audit logs
              if (createdRecords.length > 0) {
                const auditLogs = createdRecords.map((record, idx) => ({
                  recordId: record.id,
                  userId: userId,
                  action: "CREATE",
                  diffJson: recordsToCreate[idx],
                }));

                await createAuditLogsBatch(auditLogs, tx);
              }
            },
            {
              maxWait: 5000,
              timeout: 30000, // 30 second timeout per small batch is plenty
            },
          );
        } catch (err: any) {
          logger.error("Batch insert failed", {
            batchStart: i,
            batchEnd: i + batch.length,
            error: err.message,
          });
          // Continue with next batch or throw?
          // For now, we throw to trigger retry
          throw err;
        }

        // Update progress
        const progress = Math.round(
          ((i + batch.length) / allValidRecords.length) * 100,
        );
        await prisma.importJob.update({
          where: { id: importJobId },
          data: {
            summary: {
              ...(job.summary as any),
              progress,
              insertedCount: totalInserted,
            },
          },
        });

        logger.info(
          `Batch ${Math.floor(i / TRANSACTION_BATCH_SIZE) + 1} completed`,
          {
            progress,
            inserted: totalInserted,
          },
        );
      }

      return totalInserted;
    });

    // Step 4: Mark job as complete
    await step.run("finalize-job", async () => {
      await prisma.importJob.update({
        where: { id: importJobId },
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
