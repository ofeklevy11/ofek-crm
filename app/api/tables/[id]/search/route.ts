import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("TableSearch");

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    const { id } = await params;
    const tableId = parseInt(id);

    if (isNaN(tableId)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get("q") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 100);
    const searchFieldsParam = searchParams.get("searchFields") || "";
    const displayFieldsParam = searchParams.get("displayFields") || "";

    // Parse field lists
    const searchFields = searchFieldsParam
      ? searchFieldsParam.split(",").filter(Boolean)
      : [];
    const displayFields = displayFieldsParam
      ? displayFieldsParam.split(",").filter(Boolean)
      : [];

    if (!searchQuery) {
      return NextResponse.json([]);
    }

    if (searchFields.length === 0) {
      return NextResponse.json(
        { error: "No search fields specified" },
        { status: 400 }
      );
    }

    // Get the table metadata and schema - FILTERED BY COMPANY
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableId,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: { id: true, schemaJson: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    if (!canReadTable(user, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasUserFlag(user, "canSearchTables")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse schema
    let schema: any[] = [];
    try {
      if (Array.isArray(table.schemaJson)) {
        schema = table.schemaJson;
      }
    } catch (e) {
      log.error("Invalid schema JSON", { error: String(e) });
    }

    // OPTIMIZED: Use raw SQL with ILIKE to filter directly in DB
    // instead of fetching 200 records and filtering in memory
    // This is much more efficient for large tables
    const escapedQuery = searchQuery.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escapedQuery}%`;

    // Build SQL query that searches in specified JSON fields
    // Using @> for JSONB containment or casting to text for ILIKE
    const rawRecords = await prisma.$queryRaw<
      { id: number; data: any }[]
    >`
      SELECT id, data FROM "Record"
      WHERE "tableId" = ${tableId}
      AND "companyId" = ${user.companyId}
      AND "data"::text ILIKE ${searchPattern}
      ORDER BY "createdAt" DESC
      LIMIT ${limit * 2}
    `;

    // Parse record data once upfront to avoid re-parsing in multiple loops
    const parsedRecords = rawRecords.map((record) => {
      let data = record.data as any;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { data = {}; }
      }
      return { id: record.id, data };
    });

    // Filter to ensure we only match specified search fields
    // (the raw query is broader, so we refine here with minimal data)
    const lowerQuery = searchQuery.toLowerCase();
    const filteredRecords = parsedRecords.filter((record) => {
      // Search only in specified fields
      return searchFields.some((fieldName) => {
        const fieldValue = record.data?.[fieldName];
        if (!fieldValue) return false;

        // Handle different field types
        if (Array.isArray(fieldValue)) {
          return fieldValue.some((v) =>
            String(v).toLowerCase().includes(lowerQuery)
          );
        }

        return String(fieldValue)
          .toLowerCase()
          .includes(lowerQuery);
      });
    });

    // Limit results
    const limitedRecords = filteredRecords.slice(0, limit);

    // Fetch related data ONLY for specific IDs referenced in search results
    const relationFields = schema.filter((f: any) => f.type === "relation");
    const relatedDataMap: Record<number, Record<number, any>> = {};

    // P144: Collect only the specific record IDs referenced in results
    const neededIdsByTable: Record<number, Set<number>> = {};
    for (const field of relationFields) {
      if (!field.relationTableId) continue;
      const idSet = new Set<number>();
      for (const record of limitedRecords) {
        const val = record.data?.[field.name];
        if (val == null) continue;
        if (Array.isArray(val)) {
          val.forEach((v: any) => { const n = Number(v); if (!isNaN(n)) idSet.add(n); });
        } else {
          const n = Number(val);
          if (!isNaN(n)) idSet.add(n);
        }
      }
      if (idSet.size > 0) {
        if (!neededIdsByTable[field.relationTableId]) {
          neededIdsByTable[field.relationTableId] = idSet;
        } else {
          idSet.forEach(id => neededIdsByTable[field.relationTableId].add(id));
        }
      }
    }

    // Fetch only the needed related records (not entire tables)
    await Promise.all(
      Object.entries(neededIdsByTable).map(async ([tableIdStr, idSet]) => {
        const relTableId = Number(tableIdStr);
        try {
          const relatedRecords = await prisma.record.findMany({
            where: {
              id: { in: [...idSet] },
              tableId: relTableId,
              companyId: user.companyId,
            },
            select: { id: true, data: true },
            take: 5000, // P227: Cap related records to prevent unbounded query
          });

          const dataMap: Record<number, any> = {};
          relatedRecords.forEach((r) => {
            let data = r.data as any;
            if (typeof data === "string") {
              try { data = JSON.parse(data); } catch { data = {}; }
            }
            dataMap[r.id] = data;
          });

          relatedDataMap[relTableId] = dataMap;
        } catch (error) {
          log.error("Failed to fetch related table", { relTableId, error: String(error) });
        }
      })
    );

    // Build schema lookup map for O(1) field access instead of O(n) per lookup
    const schemaByName = new Map(schema.map((f: any) => [f.name, f]));

    // Helper function to resolve relation value
    const resolveRelationValue = (fieldName: string, value: any): string => {
      const field = schemaByName.get(fieldName);
      if (!field || field.type !== "relation" || !field.relationTableId) {
        return String(value);
      }

      const relatedTable = relatedDataMap[field.relationTableId];
      if (!relatedTable) return String(value);

      if (Array.isArray(value)) {
        return value
          .map((id) => {
            const relatedRecord = relatedTable[id];
            if (!relatedRecord) return `#${id}`;
            if (field.displayField && relatedRecord[field.displayField]) {
              return String(relatedRecord[field.displayField]);
            }
            return String(Object.values(relatedRecord)[0] || `#${id}`);
          })
          .join(", ");
      }

      const relatedRecord = relatedTable[value];
      if (!relatedRecord) return String(value);
      if (field.displayField && relatedRecord[field.displayField]) {
        return String(relatedRecord[field.displayField]);
      }
      return String(Object.values(relatedRecord)[0] || value);
    };

    // Format records for response with resolved relations
    const firstField = displayFields.length > 0 ? displayFields[0] : null;
    const formattedRecords = limitedRecords.map((record) => {
      const data = record.data;

      // Filter data to include only display fields with resolved relations
      const filteredData: Record<string, any> = {};
      let firstFieldResolved: string | null = null;
      displayFields.forEach((fieldName) => {
        if (data[fieldName] !== undefined) {
          const field = schemaByName.get(fieldName);
          if (field && field.type === "relation") {
            const resolved = resolveRelationValue(fieldName, data[fieldName]);
            filteredData[fieldName] = {
              _id: data[fieldName],
              _displayValue: resolved,
            };
            if (fieldName === firstField) firstFieldResolved = resolved;
          } else {
            filteredData[fieldName] = data[fieldName];
          }
        }
      });

      // Create a display title from first display field
      let displayTitle = `#${record.id}`;
      if (firstField && data[firstField]) {
        displayTitle = (firstFieldResolved ?? String(data[firstField])).substring(0, 60);
      }

      return {
        id: record.id,
        displayTitle,
        data: filteredData,
        tableId: tableId,
      };
    });

    return NextResponse.json(formattedRecords);
  } catch (error) {
    log.error("Failed to search records", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to search records" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/tables/[id]/search", handleGET);
