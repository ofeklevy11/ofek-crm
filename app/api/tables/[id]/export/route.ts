// app/api/tables/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag, canReadTable } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";

const dtFmt = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** Format a single record as a CSV or TSV row. */
function formatRow(
  record: any,
  fields: { name: string }[],
  sep: string,
): string {
  const data = record.data || {};
  const quote = sep === ",";

  const fieldValues = fields.map((f) => {
    const val = String(data[f.name] ?? "");
    return quote ? `"${val.replace(/"/g, '""')}"` : val;
  });

  const wrap = (s: string) => (quote ? `"${s.replace(/"/g, '""')}"` : s);

  return [
    record.id,
    ...fieldValues,
    wrap(dtFmt.format(new Date(record.createdAt))),
    wrap(record.creator?.name || ""),
    wrap(dtFmt.format(new Date(record.updatedAt))),
    wrap(record.updater?.name || ""),
  ].join(sep);
}

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canExportTables")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.bulk);
    if (rl) return rl;

    const tableIdNum = parseInt(id, 10);
    if (!Number.isFinite(tableIdNum) || tableIdNum < 1) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    const sep = format === "csv" ? "," : "\t";

    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableIdNum,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: { id: true, name: true, schemaJson: true },
    });

    if (!table) {
      return NextResponse.json(
        { error: "Table not found" },
        { status: 404 },
      );
    }

    if (!canReadTable(user, tableIdNum)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse schema for field definitions
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
      }
    } catch {
      fields = [];
    }

    // If schema is empty, peek at the first record to infer fields
    if (fields.length === 0) {
      const firstRecord = await prisma.record.findFirst({
        where: { tableId: tableIdNum, companyId: user.companyId },
        select: { data: true },
      });
      if (firstRecord?.data && typeof firstRecord.data === "object") {
        fields = Object.keys(firstRecord.data as Record<string, unknown>).map((k) => ({
          name: k,
          label: k,
          type: "text",
        }));
      }
    }

    const allHeaders = [
      "ID",
      ...fields.map((f) => f.name),
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ];

    const BOM = "\uFEFF";
    const BATCH_SIZE = 500;
    const MAX_EXPORT_RECORDS = 50000;

    const safeName = (table.name || `table_${tableIdNum}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const filename = `${safeName}_export_${new Date().toISOString().slice(0, 10)}.${format}`;

    // Stream the response: fetch records in cursor-batched chunks of 500
    const encoder = new TextEncoder();
    const companyId = user.companyId;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // BOM + header row
          controller.enqueue(encoder.encode(BOM + allHeaders.join(sep) + "\n"));

          let lastId: number | undefined;
          let totalExported = 0;

          while (totalExported < MAX_EXPORT_RECORDS) {
            const batch = await prisma.record.findMany({
              where: {
                tableId: tableIdNum,
                companyId,
                ...(lastId != null ? { id: { lt: lastId } } : {}),
              },
              orderBy: { id: "desc" },
              take: BATCH_SIZE,
              select: {
                id: true,
                data: true,
                createdAt: true,
                updatedAt: true,
                creator: { select: { name: true } },
                updater: { select: { name: true } },
              },
            });

            if (batch.length === 0) break;

            const lines = batch.map((record) => formatRow(record, fields, sep));
            controller.enqueue(encoder.encode(lines.join("\n") + "\n"));

            totalExported += batch.length;
            lastId = batch[batch.length - 1].id;

            if (batch.length < BATCH_SIZE) break;
          }

          controller.close();
        } catch (err) {
          controller.error(new Error("Export failed"));
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics("/api/tables/[id]/export", handleGET);
