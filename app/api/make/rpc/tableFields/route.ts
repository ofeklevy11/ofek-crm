import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTableFields");

/** Field types that aren't real data columns and should be excluded */
const NON_DATA_TYPES = new Set([
  "relation",
  "lookup",
  "automation",
]);

/** Map CRM column types to Make parameter types */
function mapColumnType(crmType: string): string {
  switch (crmType) {
    case "number":
    case "currency":
    case "score":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "select":
    case "radio":
      return "select";
    case "url":
      return "url";
    default:
      return "text";
  }
}

async function handleTableFields(req: Request) {
  try {
    const url = new URL(req.url);

    // Extract table_slug from query params or POST body
    let body: any = null;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch { /* no body or invalid JSON */ }
    }

    const tableSlug =
      url.searchParams.get("table_slug") ||
      url.searchParams.get("tableSlug") ||
      body?.table_slug ||
      body?.tableSlug;

    log.info("RPC tableFields called", { tableSlug, method: req.method, fullUrl: req.url });

    const auth = await validateMakeApiKey(req);
    if (!auth.success) return auth.response;
    const { keyRecord } = auth;

    log.info("Auth passed", { companyId: keyRecord.companyId });

    const rateLimited = await checkRateLimit(
      String(keyRecord.companyId),
      RATE_LIMITS.api,
    );
    if (rateLimited) return rateLimited;

    // If no table selected yet, return empty array
    if (!tableSlug) {
      log.info("No table_slug provided, returning empty array");
      return NextResponse.json([]);
    }

    // Validate slug format (allow alphanumeric, dashes, and underscores)
    if (tableSlug.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(tableSlug)) {
      log.info("Invalid table_slug format", { tableSlug });
      return NextResponse.json(
        { error: "Invalid table_slug format" },
        { status: 400 },
      );
    }

    const table = await prisma.tableMeta.findFirst({
      where: {
        companyId: keyRecord.companyId,
        slug: tableSlug,
        deletedAt: null,
      },
      select: { schemaJson: true },
    });

    if (!table) {
      log.info("Table not found", { companyId: keyRecord.companyId, tableSlug });
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Parse schemaJson — handle double-stringified JSON
    let schema: any = table.schemaJson;
    let wasDoubleStringified = false;

    if (typeof schema === "string") {
      try {
        schema = JSON.parse(schema);
        wasDoubleStringified = true;
      } catch { /* leave as-is */ }
    }

    let columns: any[] = [];
    if (Array.isArray(schema)) {
      columns = schema;
    } else if (schema?.columns && Array.isArray(schema.columns)) {
      columns = schema.columns;
    }

    log.info("Schema parsed", {
      tableSlug,
      schemaType: typeof table.schemaJson,
      wasDoubleStringified,
      isArray: Array.isArray(schema),
      hasColumns: !!schema?.columns,
      columnCount: columns.length,
      rawSchema: JSON.stringify(schema).substring(0, 500),
    });

    // Build Make-compatible parameter array, filtering out non-data types
    const fields: Array<Record<string, any>> = [];

    columns
      .filter((col: any) => !NON_DATA_TYPES.has(col.type))
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((col: any) => {
        // Format B (finance-setup) has 'key' prop; Format A (UI) uses 'name' as key and 'label' as display
        const fieldKey = col.key || col.name || col.id;
        const fieldLabel = col.key ? col.name : (col.label || col.name);

        const field: Record<string, any> = {
          name: fieldKey,
          type: mapColumnType(col.type),
          label: fieldLabel,
        };

        if ((col.type === "select" || col.type === "radio") && Array.isArray(col.options)) {
          field.options = col.options.map((opt: string) => ({
            label: opt,
            value: opt,
          }));
        }

        fields.push(field);
      });

    log.info("Returning fields", { tableSlug, fieldCount: fields.length });

    return NextResponse.json(fields);
  } catch (error) {
    log.error("RPC table-fields failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export const GET = handleTableFields;
export const POST = handleTableFields;
