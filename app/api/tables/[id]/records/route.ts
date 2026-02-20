import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("TableRecords");

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tableId = parseId(id);

    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canReadTable } = await import("@/lib/permissions");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.api);
    if (rl) return rl;

    if (!canReadTable(currentUser, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify table belongs to this company and is not soft-deleted
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: currentUser.companyId, deletedAt: null },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Support lightweight picker mode with server-side search and pagination
    const url = new URL(request.url);
    const forPicker = url.searchParams.get("for") === "picker";
    const searchQuery = url.searchParams.get("q") || "";
    const rawLimit = parseInt(url.searchParams.get("limit") || "0", 10) || 0;
    const limit = Math.min(Math.max(rawLimit, 0), forPicker ? 200 : 1000);
    // Cursor-based pagination: client passes the last record ID from the previous page
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;
    if (cursorParam && (!Number.isFinite(cursor) || cursor! <= 0)) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    if (forPicker) {
      // Lightweight mode for RelationPicker: only id + data, with optional search
      let records;
      if (searchQuery) {
        // Server-side ILIKE search on JSON data
        records = await prisma.$queryRaw<{ id: number; data: any }[]>`
          SELECT id, data FROM "Record"
          WHERE "tableId" = ${tableId}
          AND "companyId" = ${currentUser.companyId}
          AND "data"::text ILIKE ${`%${searchQuery.replace(/[%_\\]/g, '\\$&')}%`}
          ORDER BY "createdAt" DESC
          LIMIT ${limit || 50}
        `;
      } else {
        records = await prisma.record.findMany({
          where: { tableId, companyId: currentUser.companyId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit || 50,
          select: { id: true, data: true },
        });
      }
      return NextResponse.json(records);
    }

    // Full mode: includes relations and attachments (used by table page)
    // Supports cursor-based pagination via ?cursor=<lastRecordId>&limit=<pageSize>
    const pageSize = limit > 0 ? Math.min(limit, 500) : 100;
    const records = await prisma.record.findMany({
      where: {
        tableId,
        companyId: currentUser.companyId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ id: "desc" }],
      take: pageSize + 1, // fetch one extra to detect next page
      include: {
        creator: {
          select: { id: true, name: true },
        },
        updater: {
          select: { id: true, name: true },
        },
        dialedBy: {
          select: { id: true, name: true },
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            displayName: true,
            url: true,
            size: true,
            uploadedAt: true,
          },
        },
      },
    });

    const hasMore = records.length > pageSize;
    const page = hasMore ? records.slice(0, pageSize) : records;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // Add proxied download URLs to attachments
    // Attachments keep their url because they are user-entered links, not storage secrets
    const sanitized = page.map((record) => ({
      ...record,
      attachments: record.attachments.map((att) => ({
        ...att,
        downloadUrl: `/api/attachments/${att.id}/download`,
      })),
    }));

    return NextResponse.json({ records: sanitized, nextCursor, hasMore });
  } catch (error) {
    log.error("Failed to fetch records", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch records" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tableId = parseId(id);

    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const { canWriteTable } = await import("@/lib/permissions");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.api);
    if (rl) return rl;

    // Check write permissions
    if (!canWriteTable(currentUser, tableId)) {
      return NextResponse.json(
        { error: "You don't have permission to write to this table" },
        { status: 403 },
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { data } = body;

    // SECURITY: Verify table belongs to user's company and is not soft-deleted
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: currentUser.companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Validate attachment URLs (must be http or https)
    if (Array.isArray(body.attachments)) {
      for (const att of body.attachments) {
        if (att.url != null && att.url !== "") {
          if (typeof att.url !== "string" || att.url.length > 2048 || !/^https?:\/\//i.test(att.url)) {
            return NextResponse.json({ error: "Invalid attachment URL: must be http or https" }, { status: 400 });
          }
        }
      }
    }

    const record = await prisma.record.create({
      data: {
        tableId,
        companyId: currentUser.companyId,
        data: data || {},
        createdBy: currentUser.id,
        attachments: {
          create: body.attachments?.map((att: any) => ({
            filename: att.filename,
            url: att.url,
            size: 0,
            displayName: att.displayName || null,
            uploadedBy: currentUser.id,
            companyId: currentUser.companyId,
          })),
        },
      },
      select: {
        id: true,
        tableId: true,
        data: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createAuditLog(record.id, currentUser.id, "CREATE", data, undefined, currentUser.companyId);

    // Trigger automations (async via Inngest, with direct fallback)
    try {
      await inngest.send({
        id: `api-new-record-${currentUser.companyId}-${record.id}`,
        name: "automation/new-record",
        data: {
          tableId,
          tableName: table.name,
          recordId: record.id,
          companyId: currentUser.companyId,
        },
      });
    } catch (autoError) {
      log.error("Inngest send failed, falling back to direct automation execution", { error: String(autoError) });
      try {
        const { processNewRecordTrigger } = await import("@/app/actions/automations-core");
        await processNewRecordTrigger(tableId, table.name, record.id, currentUser.companyId);
      } catch (directErr) {
        log.error("Direct automation execution also failed", { error: String(directErr) });
      }
    }

    return NextResponse.json(record);
  } catch (error) {
    log.error("Failed to create record", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 },
    );
  }
}
