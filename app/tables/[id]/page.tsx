import { prisma } from "@/lib/prisma";
import RecordTable from "@/components/RecordTable";
import AddRecordForm from "@/components/AddRecordForm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import SearchInput from "@/components/SearchInput";
import Pagination from "@/components/Pagination";

export default async function TableDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const { q, page } = await searchParams;
  const tableId = parseInt(id);
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  if (isNaN(tableId)) return notFound();

  const table = await prisma.tableMeta.findUnique({
    where: { id: tableId },
  });

  if (!table) return notFound();

  let records;
  let totalCount = 0;

  if (q) {
    const rawRecords = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Record"
      WHERE "tableId" = ${tableId}
      AND "data"::text ILIKE ${`%${q}%`}
    `;
    totalCount = rawRecords.length;
    const ids = rawRecords
      .map((r: { id: number }) => r.id)
      .slice((currentPage - 1) * pageSize, currentPage * pageSize);

    records = await prisma.record.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { attachments: true } },
      },
    });
  } else {
    totalCount = await prisma.record.count({
      where: { tableId },
    });
    records = await prisma.record.findMany({
      where: { tableId },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { attachments: true } },
      },
    });
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  // Parse schema safely
  let schema: any[] = [];
  try {
    if (Array.isArray(table.schemaJson)) {
      schema = table.schemaJson;
    }
  } catch (e) {
    console.error("Invalid schema JSON", e);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/tables"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition"
          >
            <span className="mr-2">←</span> Back to Tables
          </Link>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                {table.name}
              </h1>
              <p className="text-gray-600">
                {totalCount} {totalCount === 1 ? "record" : "records"} total
              </p>
            </div>
            <div className="flex gap-3 items-center w-full md:w-auto">
              <SearchInput />
              <AddRecordForm tableId={tableId} schema={schema} />
            </div>
          </div>
        </div>

        <RecordTable
          tableId={tableId}
          schema={schema}
          initialRecords={records.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          }))}
          slug={table.slug}
        />
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
