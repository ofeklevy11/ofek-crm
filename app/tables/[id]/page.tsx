import { prisma } from "@/lib/prisma";
import RecordTable from "@/components/RecordTable";
import AddRecordForm from "@/components/AddRecordForm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canWriteTable, hasUserFlag } from "@/lib/permissions";
import { parseTabsConfig, parseDisplayConfig } from "@/lib/types/table-tabs";
import TableSettingsButton from "@/components/TableSettingsButton";

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

  // CRITICAL: Filter by companyId + exclude soft-deleted
  const table = await prisma.tableMeta.findFirst({
    where: {
      id: tableId,
      companyId: user.companyId,
      deletedAt: null,
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
  let views;

  // Views query is independent — start it immediately and run in parallel with record queries
  const viewsPromise = prisma.view.findMany({
    where: { tableId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  if (q) {
    // Search case: count + paginated IDs + views all run in parallel
    const [countResult, rawRecords, viewsData] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "Record"
        WHERE "tableId" = ${tableId}
        AND "companyId" = ${user.companyId}
        AND "data"::text ILIKE ${`%${q}%`}
        LIMIT 1000
      `,
      prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Record"
        WHERE "tableId" = ${tableId}
        AND "companyId" = ${user.companyId}
        AND "data"::text ILIKE ${`%${q}%`}
        ORDER BY "createdAt" DESC
        LIMIT ${pageSize}
        OFFSET ${(currentPage - 1) * pageSize}
      `,
      viewsPromise,
    ]);

    totalCount = Math.min(Number(countResult[0]?.count || 0), 1000);
    views = viewsData;
    const ids = rawRecords.map((r: { id: number }) => r.id);

    records = await prisma.record.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        attachments: true,
        files: true,
      },
    });
  } else {
    // Non-search case: count + records + views all run in parallel
    const [countVal, recordsVal, viewsData] = await Promise.all([
      prisma.record.count({
        where: {
          tableId,
          companyId: user.companyId,
        },
      }),
      prisma.record.findMany({
        where: {
          tableId,
          companyId: user.companyId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        include: {
          attachments: true,
          files: true,
        },
      }),
      viewsPromise,
    ]);

    totalCount = countVal;
    records = recordsVal;
    views = viewsData;
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

  // Parse tabsConfig and displayConfig
  const parsedTabsConfig = parseTabsConfig(table.tabsConfig);
  const parsedDisplayConfig = parseDisplayConfig(table.displayConfig);

  return (
    <div className="min-h-screen bg-muted/40 p-4 lg:p-6" dir="rtl">
      <div className="w-full">
        <div className="mb-8">
          <Link
            href="/tables"
            prefetch={false}
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
                <TableSettingsButton
                  tableId={tableId}
                  schema={schema}
                  tabsConfig={parsedTabsConfig}
                  displayConfig={parsedDisplayConfig}
                />
              )}
              {canEdit && (
                <AddRecordForm
                  tableId={tableId}
                  schema={schema}
                  tableName={table.name}
                  tabsConfig={parsedTabsConfig}
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
              tabsConfig={parsedTabsConfig}
              displayConfig={parsedDisplayConfig}
            />
            <Pagination totalPages={totalPages} />
          </div>

          <ViewsPanel
            tableId={tableId}
            tableSlug={table.slug}
            schema={schema}
            // @ts-ignore
            isPremium={user.isPremium || "basic"}
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
