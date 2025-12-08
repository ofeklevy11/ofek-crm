// app/api/tables/[id]/export/route.ts
import { NextResponse } from "next/server";
import * as PrismaModule from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

const prisma: any =
  (PrismaModule as any).prisma ?? (PrismaModule as any).default ?? PrismaModule;

type ContextParams = { params?: { id?: string; tableId?: string } };

export async function GET(req: Request, context: ContextParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // DEBUG: dump incoming context and url
    console.log("EXPORT ROUTE CALLED");

    // 1) try params from framework
    const paramsObj = context?.params ?? {};
    const pId = paramsObj?.id ?? paramsObj?.tableId;

    // 2) try query string
    const url = new URL(req.url);
    const qId = url.searchParams.get("id") ?? url.searchParams.get("tableId");

    // 3) last resort: parse path with regex to extract number part after /api/tables/
    const pathMatch = url.pathname.match(/\/api\/tables\/([^/]+)\/export/);
    const pathId = pathMatch ? pathMatch[1] : null;

    // choose candidate in order: params -> query -> path
    const candidate = pId ?? qId ?? pathId ?? null;

    // if candidate might include non-numeric stuff (UUID etc), try to parseInt
    let tableIdNum: number | null = null;
    if (candidate !== null && candidate !== undefined) {
      // if numeric string or numeric-like, parse to number
      const asNum = Number(candidate);
      if (!Number.isNaN(asNum)) {
        tableIdNum = asNum;
      } else {
        // maybe candidate is like "2" wrapped or "id=2", try extracting digits
        const digitsMatch = String(candidate).match(/(\d+)/);
        if (digitsMatch) {
          tableIdNum = Number(digitsMatch[1]);
        }
      }
    }

    if (!tableIdNum || Number.isNaN(tableIdNum)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const format = (url.searchParams.get("format") || "csv").toLowerCase();

    // Fetch table and records - FILTERED BY COMPANY
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableIdNum,
        companyId: user.companyId,
      },
    });

    if (!table) {
      console.error("Table not found or access denied id:", tableIdNum);
      return NextResponse.json(
        { error: "Table not found", id: tableIdNum },
        { status: 404 }
      );
    }

    const records = await prisma.record.findMany({
      where: {
        tableId: tableIdNum,
        companyId: user.companyId, // Extra safety, although table check implies it
      },
      orderBy: { createdAt: "desc" },
    });

    // try to parse schemaJson if string
    let schema: any[] = [];
    try {
      if (!table.schemaJson) schema = [];
      else if (typeof table.schemaJson === "string")
        schema = JSON.parse(table.schemaJson);
      else schema = table.schemaJson;
    } catch (e) {
      console.warn("schemaJson parse failed, using fallback", e);
      schema = [];
    }

    // build headers (if no schema, take keys from first record.data)
    let headers: string[] = [];
    if (schema && schema.length > 0)
      headers = schema.map((f: any) => f.label ?? f.name ?? "field");
    else if (records.length > 0) headers = Object.keys(records[0].data || {});
    else headers = [];

    const includeCreatedAt = true;
    if (includeCreatedAt) headers = [...headers, "Created At"];

    const BOM = "\uFEFF";
    let content = "";

    if (format === "csv") {
      const delimiter = ",";
      const rows = records.map((record: any) => {
        const data = record.data || {};
        const values =
          schema && schema.length > 0
            ? schema.map((field: any) => {
                const v = data[field.name];
                const s = v === null || v === undefined ? "" : String(v);
                return `"${s.replace(/"/g, '""')}"`;
              })
            : headers
                .slice(0, includeCreatedAt ? -1 : headers.length)
                .map((h) => {
                  const v = data[h];
                  const s = v === null || v === undefined ? "" : String(v);
                  return `"${s.replace(/"/g, '""')}"`;
                });

        if (includeCreatedAt)
          values.push(`"${new Date(record.createdAt).toLocaleString()}"`);
        return values.join(delimiter);
      });

      content = BOM + [headers.join(delimiter), ...rows].join("\n");
    } else {
      // txt tab delimited
      const delimiter = "\t";
      const rows = records.map((record: any) => {
        const data = record.data || {};
        const values =
          schema && schema.length > 0
            ? schema.map((field: any) => String(data[field.name] ?? ""))
            : headers
                .slice(0, includeCreatedAt ? -1 : headers.length)
                .map((h) => String(data[h] ?? ""));
        if (includeCreatedAt)
          values.push(new Date(record.createdAt).toLocaleString());
        return values.join(delimiter);
      });

      content = BOM + [headers.join(delimiter), ...rows].join("\n");
    }

    const safeName = (table.name || `table_${tableIdNum}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const filename = `${safeName}_export_${new Date()
      .toISOString()
      .slice(0, 10)}.${format}`;

    return new NextResponse(content, {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("EXPORT fatal error:", err);
    return NextResponse.json(
      { error: "Export failed", details: String(err) },
      { status: 500 }
    );
  }
}
