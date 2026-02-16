import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReadTable } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("TablesBatch");

/**
 * Batched endpoint to fetch display values for related records.
 * Instead of N separate calls per relation field, the client sends one request
 * with all table IDs and the specific record IDs it needs.
 *
 * POST body: {
 *   tables: {
 *     [tableId: string]: {
 *       recordIds: number[],
 *       displayField?: string
 *     }
 *   }
 * }
 *
 * Response: {
 *   [tableId: string]: {
 *     [recordId: string]: { displayValue: string }
 *   }
 * }
 */
export async function POST(request: Request) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.api);
    if (rl) return rl;

    const body = await request.json();
    const { tables } = body;

    if (!tables || typeof tables !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const tableIds = Object.keys(tables).map(Number).filter((id) => !isNaN(id));

    if (tableIds.length === 0) {
      return NextResponse.json({});
    }

    // Verify all requested tables belong to user's company
    const validTables = await prisma.tableMeta.findMany({
      where: {
        id: { in: tableIds },
        companyId: currentUser.companyId,
      },
      select: { id: true },
    });

    const validTableIds = new Set(
      validTables.map((t) => t.id).filter((id) => canReadTable(currentUser, id))
    );

    // Collect all record IDs per table, only for valid tables
    const allRecordIds: number[] = [];
    const tableRecordMap: Record<number, number[]> = {};

    for (const tableId of tableIds) {
      if (!validTableIds.has(tableId)) continue;
      const entry = tables[String(tableId)];
      const recordIds = (entry.recordIds || [])
        .map(Number)
        .filter((id: number) => !isNaN(id));
      if (recordIds.length > 0) {
        tableRecordMap[tableId] = recordIds;
        allRecordIds.push(...recordIds);
      }
    }

    if (allRecordIds.length === 0) {
      return NextResponse.json({});
    }

    if (allRecordIds.length > 5000) {
      return NextResponse.json(
        { error: "Too many record IDs requested (max 5000)" },
        { status: 400 },
      );
    }

    // Fetch all needed records in a single query
    const records = await prisma.record.findMany({
      where: {
        id: { in: [...new Set(allRecordIds)] },
        companyId: currentUser.companyId,
      },
      select: {
        id: true,
        tableId: true,
        data: true,
      },
    });

    // Build response grouped by tableId
    const result: Record<string, Record<string, { displayValue: string }>> = {};

    // Index records by id for quick lookup
    const recordById = new Map<number, (typeof records)[0]>();
    for (const record of records) {
      recordById.set(record.id, record);
    }

    for (const tableId of Object.keys(tableRecordMap).map(Number)) {
      const entry = tables[String(tableId)];
      const displayField = entry.displayField;
      const recordIds = tableRecordMap[tableId];

      result[String(tableId)] = {};

      for (const recordId of recordIds) {
        const record = recordById.get(recordId);
        if (!record) continue;

        const data = record.data as Record<string, any>;
        let displayValue: string;

        if (displayField && data[displayField] !== undefined && data[displayField] !== null) {
          displayValue = String(data[displayField]);
        } else {
          // Fallback: use first field value
          const firstValue = Object.values(data)[0];
          displayValue = firstValue !== undefined && firstValue !== null
            ? String(firstValue)
            : `#${recordId}`;
        }

        result[String(tableId)][String(recordId)] = { displayValue };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error("Failed to fetch batch related records", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch related records" },
      { status: 500 },
    );
  }
}
