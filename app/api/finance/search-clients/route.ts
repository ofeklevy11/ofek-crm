import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tableSlug = searchParams.get("table"); // 'work-dm' or 'work-web-design'
    const searchQuery = searchParams.get("search") || "";

    if (!tableSlug) {
      return NextResponse.json(
        { error: "Table parameter is required" },
        { status: 400 }
      );
    }

    // Get the table metadata - FILTERED BY COMPANY
    const table = await prisma.tableMeta.findFirst({
      where: { slug: tableSlug, companyId: user.companyId },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Get all records from the table - FILTERED BY COMPANY
    let records = await prisma.record.findMany({
      where: { tableId: table.id, companyId: user.companyId },
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

      // Improved name detection strategy
      let clientName = "Unknown";

      const potentialNameKeys = [
        "c_name",
        "name",
        "Name",
        "full_name",
        "fullName",
        "title",
        "Title",
        "client_name",
      ];

      // 1. Try known keys
      for (const key of potentialNameKeys) {
        if (data[key] && typeof data[key] === "string") {
          clientName = data[key];
          break;
        }
      }

      // 2. If still Unknown, look for any key with "name" in it
      if (clientName === "Unknown") {
        const nameKey = Object.keys(data).find(
          (k) => k.toLowerCase().includes("name") && typeof data[k] === "string"
        );
        if (nameKey) {
          clientName = data[nameKey];
        }
      }

      // 3. Fallback to first string field
      if (clientName === "Unknown") {
        const firstStringVal = Object.values(data).find(
          (v) =>
            typeof v === "string" &&
            (v as string).length > 0 &&
            (v as string).length < 100
        );
        if (firstStringVal) {
          clientName = firstStringVal as string;
        }
      }

      // 4. Ultimate fallback
      if (clientName === "Unknown") {
        clientName = `Record #${record.id}`;
      }

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
