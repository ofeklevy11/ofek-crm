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

    const auth = await validateMakeApiKey(req);
    if (!auth.success) return auth.response;
    const { keyRecord } = auth;

    const rateLimited = await checkRateLimit(
      String(keyRecord.companyId),
      RATE_LIMITS.api,
    );
    if (rateLimited) return rateLimited;

    // If no table selected yet, return empty array
    if (!tableSlug) {
      return NextResponse.json([]);
    }

    // Validate slug format (allow alphanumeric, dashes, and underscores)
    if (tableSlug.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(tableSlug)) {
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

    return NextResponse.json(fields);
  } catch (error) {
    log.error("RPC table-fields failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
