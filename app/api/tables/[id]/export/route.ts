// app/api/tables/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tableIdNum = Number(id);
    if (!tableIdNum || Number.isNaN(tableIdNum)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "csv").toLowerCase();

    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableIdNum,
        companyId: user.companyId,
      },
    });

    if (!table) {
      return NextResponse.json(
        { error: "Table not found", id: tableIdNum },
        { status: 404 }
      );
    }

    const records = await prisma.record.findMany({
      where: {
        tableId: tableIdNum,
        companyId: user.companyId,
      },
      orderBy: { createdAt: "desc" },
    });

    let schema: any[] = [];
    try {
      if (!table.schemaJson) schema = [];
      else if (typeof table.schemaJson === "string")
        schema = JSON.parse(table.schemaJson);
      else schema = table.schemaJson as any;
    } catch {
      schema = [];
    }

    let headers: string[] = [];
    if (schema.length > 0)
      headers = schema.map((f: any) => f.label ?? f.name ?? "field");
    else if (records.length > 0) headers = Object.keys(records[0].data || {});

    const includeCreatedAt = true;
    if (includeCreatedAt) headers.push("Created At");

    const BOM = "\uFEFF";
    let content = "";

    if (format === "csv") {
      const rows = records.map((record: any) => {
        const data = record.data || {};
        const values = headers.map((h) => {
          if (h === "Created At")
            return `"${new Date(record.createdAt).toLocaleString()}"`;
          const v = data[h];
          return `"${String(v ?? "").replace(/"/g, '""')}"`;
        });
        return values.join(",");
      });

      content = BOM + [headers.join(","), ...rows].join("\n");
    } else {
      const rows = records.map((record: any) => {
        const data = record.data || {};
        const values = headers.map((h) =>
          h === "Created At"
            ? new Date(record.createdAt).toLocaleString()
            : String(data[h] ?? "")
        );
        return values.join("\t");
      });

      content = BOM + [headers.join("\t"), ...rows].join("\n");
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
    return NextResponse.json(
      { error: "Export failed", details: String(err) },
      { status: 500 }
    );
  }
}
