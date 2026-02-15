import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { withRetry } from "@/lib/db-retry";

// Regex to validate field names — prevents SQL injection in raw queries
export const SAFE_FIELD_NAME = /^[a-zA-Z0-9_\u0590-\u05FF]+$/;

/**
 * Build a safe Prisma.raw() reference for a JSON data field accessor.
 * SECURITY: Validates fieldName against SAFE_FIELD_NAME before emitting raw SQL.
 * Throws if the field name is invalid — callers must handle or pre-check.
 */
export function safeJsonFieldRef(fieldName: string): Prisma.Sql {
  if (!SAFE_FIELD_NAME.test(fieldName)) {
    throw new Error(`Invalid field name for JSON accessor: ${fieldName}`);
  }
  return Prisma.raw(`"data"->>'${fieldName.replace(/'/g, "''")}'`);
}

/**
 * Internal: fetch table view data without auth check.
 * Used by Inngest background jobs for cache pre-computation.
 */
export async function getTableViewDataInternal(
  tableId: number,
  companyId: number,
  viewId: number,
): Promise<any | null> {
  // Single query: view.findFirst with tableId + companyId already validates the table exists
  const view = await withRetry(() => prisma.view.findFirst({
    where: { id: viewId, tableId, companyId },
    select: { config: true },
  }));
  if (!view) return null;

  const { processViewServer } = await import("@/lib/viewProcessorServer");

  return processViewServer({
    tableId,
    companyId,
    config: view.config as any,
  });
}

/**
 * Internal: fetch custom table data without auth check.
 * Used by Inngest background jobs for cache pre-computation.
 */
export async function getCustomTableDataInternal(
  tableId: number,
  companyId: number,
  settings: {
    columns?: string[];
    limit?: number;
    sort?: "asc" | "desc";
    sortBy?: string;
  },
): Promise<any | null> {
  const limit = Math.min(settings.limit || 10, 500);
  const sort = settings.sort || "desc";
  const sortBy = settings.sortBy || "createdAt";
  const isDbSort = sortBy === "createdAt" || sortBy === "updatedAt";

  // Fetch table metadata (without records) — select only fields used below
  const table = await withRetry(() => prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    select: { id: true, name: true, slug: true, schemaJson: true },
  }));
  if (!table) return null;

  const schema = table.schemaJson as any[];

  // Fetch records — use raw SQL for JSON field sorting to avoid loading 1000 rows
  let rawRecords: any[];

  if (isDbSort) {
    // Standard DB column sort — use Prisma ORM
    rawRecords = await withRetry(() => prisma.record.findMany({
      where: { tableId, companyId },
      orderBy: { [sortBy]: sort },
      take: limit + 1,
      include: {
        creator: { select: { name: true } },
        updater: { select: { name: true } },
      },
    }));
  } else if (!SAFE_FIELD_NAME.test(sortBy)) {
    // Invalid field name — fallback to default sort
    rawRecords = await withRetry(() => prisma.record.findMany({
      where: { tableId, companyId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: {
        creator: { select: { name: true } },
        updater: { select: { name: true } },
      },
    }));
  } else {
    // Guard: if table has >5000 rows, JSON field sort causes a sequential scan — fall back to createdAt
    const rowCount = await withRetry(() => prisma.record.count({ where: { tableId, companyId } }));
    if (rowCount > 5000) {
      rawRecords = await withRetry(() => prisma.record.findMany({
        where: { tableId, companyId },
        orderBy: { createdAt: sort },
        take: limit + 1,
        include: {
          creator: { select: { name: true } },
          updater: { select: { name: true } },
        },
      }));
    } else {
    // JSON field sort — use raw SQL to sort at DB level, fetch only limit+1 rows
    const fieldSchema = schema.find((f: any) => f.name === sortBy);
    const isNumeric = ["number", "rating", "score", "Rating", "Score"].includes(fieldSchema?.type);
    const direction = sort === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const fieldRef = safeJsonFieldRef(sortBy);

    const orderClause = isNumeric
      ? Prisma.sql`(${fieldRef})::numeric ${direction} NULLS LAST`
      : Prisma.sql`${fieldRef} ${direction} NULLS LAST`;

    const rows: any[] = await withRetry(() => prisma.$queryRaw`
      SELECT r.id, r.data, r."createdAt", r."updatedAt", r."createdBy", r."updatedBy",
             uc.name as "creatorName", uu.name as "updaterName"
      FROM "Record" r
      LEFT JOIN "User" uc ON r."createdBy" = uc.id
      LEFT JOIN "User" uu ON r."updatedBy" = uu.id
      WHERE r."tableId" = ${tableId} AND r."companyId" = ${companyId}
      ORDER BY ${orderClause}
      LIMIT ${limit + 1}
    `);

    // Map raw rows to match Prisma record shape
    rawRecords = rows.map((row) => ({
      ...row,
      creator: row.creatorName ? { name: row.creatorName } : null,
      updater: row.updaterName ? { name: row.updaterName } : null,
    }));
    }
  }

  const columns = settings.columns
    ? [
        ...schema
          .filter((f: any) => settings.columns?.includes(f.name))
          .map((f: any) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            options: f.options,
            optionColors: f.optionColors,
          })),
        ...(settings.columns?.includes("createdAt")
          ? [{ name: "createdAt", label: "נוצר בתאריך", type: "datetime" }]
          : []),
        ...(settings.columns?.includes("updatedAt")
          ? [{ name: "updatedAt", label: "עודכן בתאריך", type: "datetime" }]
          : []),
        ...(settings.columns?.includes("createdBy")
          ? [{ name: "createdBy", label: "נוצר על ידי", type: "string" }]
          : []),
        ...(settings.columns?.includes("updatedBy")
          ? [{ name: "updatedBy", label: "עודכן על ידי", type: "string" }]
          : []),
      ]
    : schema.slice(0, 7).map((f: any) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        options: f.options,
        optionColors: f.optionColors,
      }));

  let records = rawRecords.map((r: any) => ({
    ...r,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.creator?.name || "מערכת",
    updatedBy: r.updater?.name || "מערכת",
  }));

  const hasMore = records.length > limit;
  records = records.slice(0, limit);

  return {
    type: "custom-table",
    title: table.name,
    data: {
      columns,
      records,
      hasMore,
      tableSlug: table.slug,
      currentSort: { field: sortBy, direction: sort },
      tableId: table.id,
    },
  };
}
