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
    const searchField = searchParams.get("field") || ""; // העמודה לחיפוש
    const limit = parseInt(searchParams.get("limit") || "5");

    if (!searchQuery) {
      return NextResponse.json([]);
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
      take: 100, // limit to avoid memory issues
    });

    let filteredRecords = allRecords;

    // Filter based on search query
    if (searchField && searchQuery) {
      // חיפוש בשדה ספציפי
      filteredRecords = allRecords.filter((record) => {
        let data = record.data as any;

        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (e) {
            return false;
          }
        }

        const fieldValue = data?.[searchField];
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
    } else if (searchQuery) {
      // חיפוש בכל השדות
      filteredRecords = allRecords.filter((record) => {
        let data = record.data as any;

        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (e) {
            return false;
          }
        }

        return Object.values(data).some((value) => {
          if (typeof value === "string") {
            return value.toLowerCase().includes(searchQuery.toLowerCase());
          }
          if (Array.isArray(value)) {
            return value.some((v) =>
              String(v).toLowerCase().includes(searchQuery.toLowerCase())
            );
          }
          return false;
        });
      });
    }

    // Limit results
    const limitedRecords = filteredRecords.slice(0, limit);

    // Format records for response
    const formattedRecords = limitedRecords.map((record) => {
      let data = record.data as any;

      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          data = {};
        }
      }

      // Create a display title based on the first non-empty field or ID
      let displayTitle = `#${record.id}`;
      const firstField = schema[0];
      if (firstField && data[firstField.name]) {
        displayTitle = String(data[firstField.name]).substring(0, 60);
      }

      return {
        id: record.id,
        displayTitle,
        data,
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
