import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Parse schema
    let schema: any[] = [];
    try {
      if (Array.isArray(table.schemaJson)) {
        schema = table.schemaJson;
      }
    } catch (e) {
      console.error("Invalid schema JSON", e);
    }

    // OPTIMIZED: Use raw SQL with ILIKE to filter directly in DB
    // instead of fetching 200 records and filtering in memory
    // This is much more efficient for large tables
    const escapedQuery = searchQuery.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escapedQuery}%`;

    // Build SQL query that searches in specified JSON fields
    // Using @> for JSONB containment or casting to text for ILIKE
    const rawRecords = await prisma.$queryRaw<
      { id: number; data: any; createdAt: Date }[]
    >`
      SELECT id, data, "createdAt" FROM "Record"
      WHERE "tableId" = ${tableId}
      AND "companyId" = ${user.companyId}
      AND "data"::text ILIKE ${searchPattern}
      ORDER BY "createdAt" DESC
      LIMIT ${limit * 2}
    `;

    // Filter to ensure we only match specified search fields
    // (the raw query is broader, so we refine here with minimal data)
    const filteredRecords = rawRecords.filter((record) => {
      let data = record.data as any;

      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return false;
        }
      }

      // Search only in specified fields
      return searchFields.some((fieldName) => {
        const fieldValue = data?.[fieldName];
        if (!fieldValue) return false;

        // Handle different field types
        if (Array.isArray(fieldValue)) {
          return fieldValue.some((v) =>
            String(v).toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        return String(fieldValue)
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
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
        let data = record.data as any;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch { continue; }
        }
        const val = data?.[field.name];
        if (val == null) continue;
        if (Array.isArray(val)) {
          val.forEach((v: any) => { const n = Number(v); if (!isNaN(n)) idSet.add(n); });
        } else {
          const n = Number(val);
          if (!isNaN(n)) idSet.add(n);
        }
      }
      if (idSet.size > 0) {
        neededIdsByTable[field.relationTableId] = neededIdsByTable[field.relationTableId]
          ? new Set([...neededIdsByTable[field.relationTableId], ...idSet])
          : idSet;
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
          console.error(
            `Failed to fetch related table ${relTableId}`,
            error
          );
        }
      })
    );

    // Helper function to resolve relation value
    const resolveRelationValue = (fieldName: string, value: any): string => {
      const field = schema.find((f) => f.name === fieldName);
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
    const formattedRecords = limitedRecords.map((record) => {
      let data = record.data as any;

      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          data = {};
        }
      }

      // Create a display title from first display field (with relation resolution)
      let displayTitle = `#${record.id}`;
      if (displayFields.length > 0) {
        const firstField = displayFields[0];
        if (data[firstField]) {
          displayTitle = resolveRelationValue(
            firstField,
            data[firstField]
          ).substring(0, 60);
        }
      }

      // Filter data to include only display fields with resolved relations
      const filteredData: Record<string, any> = {};
      displayFields.forEach((fieldName) => {
        if (data[fieldName] !== undefined) {
          const field = schema.find((f) => f.name === fieldName);
          if (field && field.type === "relation") {
            // For relation fields, provide both ID and resolved name
            filteredData[fieldName] = {
              _id: data[fieldName],
              _displayValue: resolveRelationValue(fieldName, data[fieldName]),
            };
          } else {
            filteredData[fieldName] = data[fieldName];
          }
        }
      });

      return {
        id: record.id,
        displayTitle,
        data: filteredData,
        tableId: tableId,
      };
    });

    return NextResponse.json(formattedRecords);
  } catch (error) {
    console.error("Error searching records:", error);
    return NextResponse.json(
      { error: "Failed to search records" },
      { status: 500 }
    );
  }
}
