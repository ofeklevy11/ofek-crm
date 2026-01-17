import { prisma } from "@/lib/prisma";
import RecordTable from "@/components/RecordTable";
import AddRecordForm from "@/components/AddRecordForm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canWriteTable, hasUserFlag } from "@/lib/permissions";

export const dynamic = "force-dynamic";

import SearchInput from "@/components/SearchInput";
import Pagination from "@/components/Pagination";
import ViewsPanel from "@/components/ViewsPanel";

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

  const user = await getCurrentUser();
  if (!user) return redirect("/login");

  // CRITICAL: Filter by companyId
  const table = await prisma.tableMeta.findFirst({
    where: {
      id: tableId,
      companyId: user.companyId,
    },
  });

  if (!table) return notFound();

  // Additional permission check (role base)
  if (!canReadTable(user, table.id)) {
    return (
      <div className="p-8 text-center text-red-600 font-bold text-xl">
        אין לך הרשאה לצפות בטבלה זו
      </div>
    );
  }

  const canEdit = canWriteTable(user, table.id);
  const canSearch = hasUserFlag(user, "canSearchTables");
  const canFilter = hasUserFlag(user, "canFilterTables");
  const canExport = hasUserFlag(user, "canExportTables");

  let records;
  let totalCount = 0;

  if (q) {
    // Raw query with ILIKE on JSON data
    // OPTIMIZATION: Added LIMIT to prevent full table scans on large tables
    // The new composite index [tableId, companyId, createdAt DESC] helps with ordering
    // Note: For very large tables (100K+ records), consider implementing
    // a dedicated search solution (e.g., PostgreSQL Full-Text Search or Elasticsearch)

    // First, get the total count for pagination (limited to improve performance)
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Record"
      WHERE "tableId" = ${tableId}
      AND "companyId" = ${user.companyId}
      AND "data"::text ILIKE ${`%${q}%`}
      LIMIT 1000
    `;
    totalCount = Math.min(Number(countResult[0]?.count || 0), 1000);

    // Get paginated IDs with OFFSET/LIMIT for efficiency
    const rawRecords = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Record"
      WHERE "tableId" = ${tableId}
      AND "companyId" = ${user.companyId}
      AND "data"::text ILIKE ${`%${q}%`}
      ORDER BY "createdAt" DESC
      LIMIT ${pageSize}
      OFFSET ${(currentPage - 1) * pageSize}
    `;
    const ids = rawRecords.map((r: { id: number }) => r.id);

    records = await prisma.record.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: {
        attachments: true,
        files: true,
      },
    });
  } else {
    // CRITICAL: Filter by companyId
    totalCount = await prisma.record.count({
      where: {
        tableId,
        companyId: user.companyId,
      },
    });
    records = await prisma.record.findMany({
      where: {
        tableId,
        companyId: user.companyId,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        attachments: true,
        files: true,
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

  // Load views for this table
  // Since we verified table belongs to company, views belonging to this table are safe.
  const views = await prisma.view.findMany({
    where: { tableId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="min-h-screen bg-muted/40 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/tables"
            className="inline-flex items-center text-primary hover:text-primary/80 font-medium mb-4 transition text-sm"
          >
            <span className="ml-2">→</span> חזרה לטבלאות
          </Link>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                {table.name}
              </h1>
              <p className="text-muted-foreground">
                {totalCount} {totalCount === 1 ? "רשומה" : "רשומות"} בסך הכל
              </p>
            </div>
            <div className="flex gap-3 items-center w-full md:w-auto">
              {canSearch && <SearchInput />}
              {canEdit && (
                <AddRecordForm
                  tableId={tableId}
                  schema={schema}
                  tableName={table.name}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="flex-1 w-full min-w-0 space-y-4">
            <RecordTable
              tableId={tableId}
              schema={schema}
              initialRecords={records.map((r) => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
              }))}
              slug={table.slug}
              views={views.map((v) => ({
                id: v.id,
                name: v.name,
                slug: v.slug,
                config: v.config,
                isEnabled: v.isEnabled,
              }))}
              canEdit={canEdit}
              canSearch={canSearch}
              canFilter={canFilter}
              canExport={canExport}
            />
            <Pagination totalPages={totalPages} />
          </div>

          <ViewsPanel
            tableId={tableId}
            tableSlug={table.slug}
            schema={schema}
            records={records.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            }))}
            views={views.map((v) => ({
              id: v.id,
              name: v.name,
              slug: v.slug,
              config: v.config,
              isEnabled: v.isEnabled,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
