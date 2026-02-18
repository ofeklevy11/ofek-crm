import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey } from "@/lib/make-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("MakeRpcTableFields");

/** Map CRM column types to Make parameter types */
function mapColumnType(crmType: string): string {
  switch (crmType) {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "select":
      return "select";
    default:
      return "text";
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tableSlug = url.searchParams.get("table_slug");

    log.info("RPC tableFields called", { tableSlug, fullUrl: req.url });

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

    // Parse schemaJson → columns
    let columns: any[] = [];
    const schema = table.schemaJson as any;
    if (Array.isArray(schema)) {
      columns = schema;
    } else if (schema?.columns && Array.isArray(schema.columns)) {
      columns = schema.columns;
    }

    log.info("Schema parsed", {
      tableSlug,
      schemaType: typeof schema,
      isArray: Array.isArray(schema),
      hasColumns: !!schema?.columns,
      columnCount: columns.length,
      rawSchema: JSON.stringify(schema).substring(0, 500),
    });

    // Build Make-compatible parameter array
    const fields: Array<Record<string, any>> = [];

    columns
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((col: any) => {
        const key = col.key || col.id;
        const field: Record<string, any> = {
          name: key,
          type: mapColumnType(col.type),
          label: col.name,
        };

        if (col.type === "select" && Array.isArray(col.options)) {
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