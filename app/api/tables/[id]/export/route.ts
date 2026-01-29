// app/api/tables/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 404 },
      );
    }

    const records = await prisma.record.findMany({
      where: {
        tableId: tableIdNum,
        companyId: user.companyId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { name: true, email: true },
        },
        updater: {
          select: { name: true, email: true },
        },
      },
    });

    let fields: { name: string; label: string; type: string }[] = [];
    try {
      let schemaArr: any[] = [];
      if (!table.schemaJson) schemaArr = [];
      else if (typeof table.schemaJson === "string")
        schemaArr = JSON.parse(table.schemaJson);
      else schemaArr = table.schemaJson as any;

      if (schemaArr.length > 0) {
        fields = schemaArr.map((f: any) => ({
          name: f.name,
          label: f.label ?? f.name ?? "Field",
          type: f.type,
        }));
      } else if (records.length > 0) {
        fields = Object.keys(records[0].data || {}).map((k) => ({
          name: k,
          label: k,
          type: "text",
        }));
      }
    } catch {
      fields = [];
    }

    // Static headers
    const staticHeaders = [
      "ID",
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ];

    // Combine schema headers with static info
    // Combine schema headers with static info
    const allHeaders = [
      "ID",
      ...fields.map((f) => f.name),
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ];

    const BOM = "\uFEFF";
    let content = "";

    if (format === "csv") {
      const rows = records.map((record: any) => {
        const data = record.data || {};

        // ID
        const idVal = record.id;

        // Schema Fields
        const fieldValues = fields.map((f) => {
          const val = data[f.name];
          const stringVal = String(val ?? "");
          return `"${stringVal.replace(/"/g, '""')}"`;
        });

        // Metadata
        const createdAt = `"${new Date(record.createdAt).toLocaleString()}"`;
        const createdBy = `"${(record.creator?.name || record.creator?.email || "").replace(/"/g, '""')}"`;
        const updatedAt = `"${new Date(record.updatedAt).toLocaleString()}"`;
        const updatedBy = `"${(record.updater?.name || record.updater?.email || "").replace(/"/g, '""')}"`;

        return [
          idVal,
          ...fieldValues,
          createdAt,
          createdBy,
          updatedAt,
          updatedBy,
        ].join(",");
      });

      content = BOM + [allHeaders.join(","), ...rows].join("\n");
    } else {
      const rows = records.map((record: any) => {
        const data = record.data || {};

        const idVal = record.id;

        const fieldValues = fields.map((f) => {
          const val = data[f.name];
          return String(val ?? "");
        });

        const createdAt = new Date(record.createdAt).toLocaleString();
        const createdBy = record.creator?.name || record.creator?.email || "";
        const updatedAt = new Date(record.updatedAt).toLocaleString();
        const updatedBy = record.updater?.name || record.updater?.email || "";

        return [
          idVal,
          ...fieldValues,
          createdAt,
          createdBy,
          updatedAt,
          updatedBy,
        ].join("\t");
      });

      content = BOM + [allHeaders.join("\t"), ...rows].join("\n");
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
      { status: 500 },
    );
  }
}
