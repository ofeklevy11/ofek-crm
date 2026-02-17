import { NextResponse } from "next/server";
import { findApiKeyByValue } from "@/lib/api-key-utils";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
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
    const apiKey = req.headers.get("x-company-api-key") || url.searchParams.get("apiKey");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing API key" },
        { status: 401 },
      );
    }

    const keyRecord = await findApiKeyByValue(apiKey);
    if (!keyRecord || !keyRecord.isActive) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401 },
      );
    }

    const rateLimited = await checkRateLimit(
      String(keyRecord.companyId),
      RATE_LIMITS.api,
    );
    if (rateLimited) return rateLimited;

    // Get table_slug from query parameters
    const tableSlug = url.searchParams.get("table_slug");

    if (!tableSlug) {
      return NextResponse.json(
        { error: "Missing table_slug parameter" },
        { status: 400 },
      );
    }

    // Validate slug format
    if (tableSlug.length > 100 || !/^[a-zA-Z0-9-]+$/.test(tableSlug)) {
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

    // Build Make-compatible parameter list
    const fields = columns
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((col: any) => {
        const field: Record<string, any> = {
          name: col.key || col.id,
          label: col.name,
          type: mapColumnType(col.type),
        };

        // For select columns, include options
        if (col.type === "select" && Array.isArray(col.options)) {
          field.options = col.options.map((opt: string) => ({
            label: opt,
            value: opt,
          }));
        }

        return field;
      });

    return NextResponse.json(fields);
  } catch (error) {
    log.error("RPC table-fields failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
