import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey, verifyRpcToken } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

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

    // Read raw body to handle any format Make.com sends
    const rawBody = await req.text();

    log.info("RPC tableFields raw request", {
      method: req.method,
      fullUrl: req.url,
      contentType: req.headers.get("content-type"),
      bodyLength: rawBody.length,
      rawBody: rawBody.substring(0, 500),
    });

    // Try JSON parsing
    let body: any = null;
    if (rawBody) {
      try { body = JSON.parse(rawBody); } catch { /* not JSON */ }
    }

    // Try URL-encoded parsing if JSON failed
    if (!body && rawBody) {
      try {
        const params = new URLSearchParams(rawBody);
        if (params.has("table_slug") || params.has("tableSlug")) {
          body = Object.fromEntries(params.entries());
        }
      } catch { /* not URL-encoded */ }
    }

    // Extract table_slug from all possible locations
    const tableSlug =
      url.searchParams.get("table_slug") ||
      url.searchParams.get("tableSlug") ||
      body?.table_slug ||
      body?.tableSlug ||
      body?.parameters?.table_slug ||
      body?.parameters?.tableSlug;

    const auth = await validateMakeApiKey(req, body?.apiKey);
    let companyId: number;

    if (auth.success) {
      companyId = auth.keyRecord.companyId;
    } else {
      // Fallback: rpcToken from query or body
      const rpcToken = url.searchParams.get("rpcToken") || body?.rpcToken;
      const tokenCompanyId = rpcToken ? verifyRpcToken(rpcToken) : null;
      if (!tokenCompanyId) return NextResponse.json([]);
      companyId = tokenCompanyId;
    }

    log.info("Auth passed", { companyId });

    const rateLimited = await checkRateLimit(
      String(companyId),
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
        companyId,
        slug: tableSlug,
        deletedAt: null,
      },
      select: { schemaJson: true },
    });

    if (!table) {
      log.info("Table not found", { companyId, tableSlug });
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

export const GET = withMetrics("/api/make/rpc/tableFields", handleTableFields);
export const POST = withMetrics("/api/make/rpc/tableFields", handleTableFields);
