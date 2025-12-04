import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tableSlug = searchParams.get("table"); // 'work-dm' or 'work-web-design'
    const searchQuery = searchParams.get("search") || "";

    if (!tableSlug) {
      return NextResponse.json(
        { error: "Table parameter is required" },
        { status: 400 }
      );
    }

    // Get the table metadata
    const table = await prisma.tableMeta.findUnique({
      where: { slug: tableSlug },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Get all records from the table
    let records = await prisma.record.findMany({
      where: { tableId: table.id },
      select: {
        id: true,
        data: true,
      },
    });

    // Filter records based on search query if provided
    if (searchQuery) {
      records = records.filter((record) => {
        let data = record.data as any;

        // Ensure data is an object
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (e) {
            return false;
          }
        }

        // Search in all string fields
        return Object.values(data).some((value) => {
          if (typeof value === "string") {
            return value.toLowerCase().includes(searchQuery.toLowerCase());
          }
          return false;
        });
      });
    }

    // Format records for response
    const formattedRecords = records.map((record) => {
      let data = record.data as any;

      // Ensure data is an object
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error("Failed to parse record data:", e);
          data = {};
        }
      }

      // DEBUG: Log to see what we actually have (first record only)
      if (record.id === records[0]?.id) {
        console.log("=== DEBUG RECORD DATA ===");
        console.log("Type of data:", typeof data);
        console.log("c_name value:", data["c_name"]);
        console.log("Full data:", JSON.stringify(data, null, 2));
      }

      // Simple and direct access as requested
      const clientName = data["c_name"] || "Unknown";

      return {
        id: record.id,
        name: clientName,
        data: data,
        tableSlug: tableSlug,
      };
    });

    return NextResponse.json(formattedRecords);
  } catch (error) {
    console.error("Error searching clients:", error);
    return NextResponse.json(
      { error: "Failed to search clients" },
      { status: 500 }
    );
  }
}
