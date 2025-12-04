import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tableId = parseInt(id);

    if (isNaN(tableId)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "5");
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

    // Get the table metadata and schema
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
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

    // Get all records from the table
    const allRecords = await prisma.record.findMany({
      where: { tableId: tableId },
      orderBy: { createdAt: "desc" },
      take: 200, // Increased limit for better search results
    });

    // Filter records based on search query in specified fields
    const filteredRecords = allRecords.filter((record) => {
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

    // Format records for response with only display fields
    const formattedRecords = limitedRecords.map((record) => {
      let data = record.data as any;

      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          data = {};
        }
      }

      // Create a display title from first display field
      let displayTitle = `#${record.id}`;
      if (displayFields.length > 0) {
        const firstField = displayFields[0];
        if (data[firstField]) {
          displayTitle = String(data[firstField]).substring(0, 60);
        }
      }

      // Filter data to include only display fields
      const filteredData: Record<string, any> = {};
      displayFields.forEach((fieldName) => {
        if (data[fieldName] !== undefined) {
          filteredData[fieldName] = data[fieldName];
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
