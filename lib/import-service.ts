import { parse } from "csv-parse";
import { Readable } from "stream";
import { createLogger } from "@/lib/logger";

const log = createLogger("ImportService");

export interface ImportResult {
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: { line: number; message: string }[];
    headers: string[];
  };
  validRecords: any[];
}

export type BatchProcessor = (records: any[]) => Promise<void>;

export async function processImportFile(
  fileContent: Buffer | ReadableStream<any> | any,
  schema: any[],
  isDryRun: boolean = true,
  onBatch?: BatchProcessor, // Optional callback for handling batches
  batchSize: number = 100, // Default batch size
): Promise<ImportResult> {
  const errors: { line: number; message: string }[] = [];
  const validRecords: any[] = [];
  let headers: string[] = [];

  const schemaMap = new Map<string, any>();
  schema.forEach((f) => schemaMap.set(f.name, f));

  try {
    // Determine the input stream
    let inputStream: Readable;

    if (Buffer.isBuffer(fileContent)) {
      inputStream = Readable.from(fileContent);
    } else if (fileContent && typeof fileContent.pipe === "function") {
      // Already a Node stream
      inputStream = fileContent;
    } else {
      // Assume it's a web ReadableStream
      // Check if Readable.fromWeb exists (Node 18+)
      if (typeof Readable.fromWeb === "function") {
        inputStream = Readable.fromWeb(fileContent);
      } else {
        // Fallback or assume it behaves like a node stream (unlikely but safe fallback)
        inputStream = Readable.from(fileContent);
      }
    }

    // Create the parser stream
    const parser = inputStream.pipe(
      parse({
        columns: true, // Auto-discover headers
        skip_empty_lines: true,
        trim: true, // Trim whitespace around fields
        bom: true, // Handle Excel UTF-8 BOM
        relax_column_count: true, // Be forgiving with column counts
        skip_records_with_error: true,
        delimiter: [",", ";", "\t", "|"], // Support various delimiters
      }),
    );

    let totalRows = 0;
    let currentBatch: any[] = [];

    for await (const row of parser) {
      totalRows++;
      const rowIndex = totalRows;

      // Extract headers from the first record
      if (headers.length === 0) {
        headers = Object.keys(row);
      }

      const rowErrors: string[] = [];
      const cleanRecord: any = {};

      for (const [key, value] of Object.entries(row)) {
        const fieldSchema = schemaMap.get(key);

        // Skip unknown columns (like ID, Created At, etc.)
        if (!fieldSchema) {
          continue;
        }

        let cleanValue = value;

        // Validation by type
        if (fieldSchema.type === "phone") {
          if (typeof value === "string") {
            let normalized = value.replace(/[^\d+]/g, "");
            // Allow + only at start
            if (normalized.indexOf("+") > 0) {
              // If + is in middle, it's invalid
              rowErrors.push(`פורמט טלפון שגוי בשדה ${key}`);
            } else {
              cleanValue = normalized;
            }
          }
        } else if (fieldSchema.type === "date") {
          // Check for valid date format YYYY-MM-DD HH:MM:SS
          const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
          if (value && !dateRegex.test(String(value))) {
            rowErrors.push(`תאריך שגוי בשדה ${key} (נדרש YYYY-MM-DD HH:MM:SS)`);
          }
        } else if (fieldSchema.type === "text") {
          if (String(value).length > 2000) {
            rowErrors.push(`טקסט ארוך מדי בשדה ${key} (מקסימום 2000 תווים)`);
          }
        } else if (
          fieldSchema.type === "textarea" ||
          fieldSchema.type === "long-text"
        ) {
          if (String(value).length > 5000) {
            rowErrors.push(`טקסט ארוך מדי בשדה ${key} (מקסימום 5000 תווים)`);
          }
        }

        // CSV Injection Prevention
        if (fieldSchema.type !== "phone" && typeof cleanValue === "string") {
          const unsafeChars = ["=", "+", "-", "@"];
          if (unsafeChars.includes(cleanValue.charAt(0))) {
            cleanValue = "'" + cleanValue;
          }
        }

        // Check for control characters
        if (
          typeof cleanValue === "string" &&
          /[\x00-\x08\x0B-\x1F\x7F]/.test(cleanValue)
        ) {
          rowErrors.push(`תווים לא חוקיים בשדה ${key}`);
        }

        cleanRecord[key] = cleanValue;
      }

      if (rowErrors.length > 0) {
        if (errors.length < 50) {
          errors.push({ line: rowIndex, message: rowErrors.join(", ") });
        }
      } else {
        // Valid Record
        if (onBatch) {
          currentBatch.push(cleanRecord);
          if (currentBatch.length >= batchSize) {
            await onBatch(currentBatch);
            currentBatch = [];
          }
        } else if (!isDryRun) {
          // If no batch processor, accumulate all (legacy mode, careful with memory)
          validRecords.push(cleanRecord);
        }
      }
    }

    // Process remaining items in batch
    if (onBatch && currentBatch.length > 0) {
      await onBatch(currentBatch);
    }

    const validCount = onBatch
      ? totalRows - errors.length
      : validRecords.length;

    return {
      summary: {
        totalRows,
        validRows: isDryRun ? totalRows - errors.length : validCount,
        invalidRows: errors.length,
        errors,
        headers,
      },
      validRecords: isDryRun || onBatch ? [] : validRecords,
    };
  } catch (err: any) {
    log.error("CSV parse error", { error: String(err) });
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [{ line: 0, message: `שגיאת קריאה קריטית: ${err.message}` }],
        headers: [],
      },
      validRecords: [],
    };
  }
}
