// app/api/tables/[id]/export/route.ts
import { NextResponse } from "next/server";
import * as PrismaModule from "@/lib/prisma";

const prisma: any = (PrismaModule as any).prisma ?? (PrismaModule as any).default ?? PrismaModule;

type ContextParams = { params?: { id?: string; tableId?: string } };

export async function GET(req: Request, context: ContextParams) {
  try {
    // DEBUG: dump incoming context and url
    console.log("EXPORT ROUTE CALLED");
    console.log("raw context:", JSON.stringify(context));
    console.log("req.url:", req.url);

    // 1) try params from framework
    const paramsObj = context?.params ?? {};
    const pId = paramsObj?.id ?? paramsObj?.tableId;
    console.log("params.id / params.tableId:", pId);

    // 2) try query string
    const url = new URL(req.url);
    const qId = url.searchParams.get("id") ?? url.searchParams.get("tableId");
    console.log("query id/tableId:", qId);

    // 3) last resort: parse path with regex to extract number part after /api/tables/
    // supports /api/tables/123/export and /api/tables/123/export?format=csv
    const pathMatch = url.pathname.match(/\/api\/tables\/([^/]+)\/export/);
    const pathId = pathMatch ? pathMatch[1] : null;
    console.log("path extracted id:", pathId);

    // choose candidate in order: params -> query -> path
    const candidate = pId ?? qId ?? pathId ?? null;
    console.log("chosen candidate for id:", candidate);

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

    console.log("resolved tableIdNum:", tableIdNum);

    if (!tableIdNum || Number.isNaN(tableIdNum)) {
      // return debug info to help you see what's missing
      const debug = {
        error: "Invalid table ID",
        candidate,
        params: paramsObj,
        query: Object.fromEntries(url.searchParams),
        pathId,
      };
      console.error("EXPORT - Invalid table ID debug:", debug);
      return NextResponse.json(debug, { status: 400 });
    }

    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    console.log("format:", format);

    // Fetch table and records
    const table = await prisma.tableMeta.findUnique({ where: { id: tableIdNum } });
    if (!table) {
      console.error("Table not found id:", tableIdNum);
      return NextResponse.json({ error: "Table not found", id: tableIdNum }, { status: 404 });
    }

    const records = await prisma.record.findMany({
      where: { tableId: tableIdNum },
      orderBy: { createdAt: "desc" },
    });

    // try to parse schemaJson if string
    let schema: any[] = [];
    try {
      if (!table.schemaJson) schema = [];
      else if (typeof table.schemaJson === "string") schema = JSON.parse(table.schemaJson);
      else schema = table.schemaJson;
    } catch (e) {
      console.warn("schemaJson parse failed, using fallback", e);
      schema = [];
    }

    // build headers (if no schema, take keys from first record.data)
    let headers: string[] = [];
    if (schema && schema.length > 0) headers = schema.map((f) => f.label ?? f.name ?? "field");
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
        const values = (schema && schema.length > 0
          ? schema.map((field) => {
              const v = data[field.name];
              const s = v === null || v === undefined ? "" : String(v);
              return `"${s.replace(/"/g, '""')}"`;
            })
          : headers.slice(0, includeCreatedAt ? -1 : headers.length).map((h) => {
              const v = data[h];
              const s = v === null || v === undefined ? "" : String(v);
              return `"${s.replace(/"/g, '""')}"`;
            })
        );

        if (includeCreatedAt) values.push(`"${new Date(record.createdAt).toLocaleString()}"`);
        return values.join(delimiter);
      });

      content = BOM + [headers.join(delimiter), ...rows].join("\n");
    } else {
      // txt tab delimited
      const delimiter = "\t";
      const rows = records.map((record: any) => {
        const data = record.data || {};
        const values = (schema && schema.length > 0
          ? schema.map((field) => String(data[field.name] ?? ""))
          : headers.slice(0, includeCreatedAt ? -1 : headers.length).map((h) => String(data[h] ?? ""))
        );
        if (includeCreatedAt) values.push(new Date(record.createdAt).toLocaleString());
        return values.join(delimiter);
      });

      content = BOM + [headers.join(delimiter), ...rows].join("\n");
    }

    const safeName = (table.name || `table_${tableIdNum}`).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `${safeName}_export_${new Date().toISOString().slice(0, 10)}.${format}`;

    console.log("EXPORT success:", { tableIdNum, filename, rows: records.length });

    return new NextResponse(content, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("EXPORT fatal error:", err);
    return NextResponse.json({ error: "Export failed", details: String(err) }, { status: 500 });
  }
}
