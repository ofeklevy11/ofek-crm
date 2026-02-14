import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { inngest } from "@/lib/inngest/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tableId = parseInt(id);

    if (isNaN(tableId)) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // CRITICAL: Verify table belongs to user's company for multi-tenancy
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First, verify the table belongs to this company
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: currentUser.companyId },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Support lightweight picker mode with server-side search and pagination
    const url = new URL(request.url);
    const forPicker = url.searchParams.get("for") === "picker";
    const searchQuery = url.searchParams.get("q") || "";
    const rawLimit = parseInt(url.searchParams.get("limit") || "0") || 0;
    const limit = Math.min(Math.max(rawLimit, 0), forPicker ? 200 : 1000);

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
    // P198: Default to 5000 when limit is 0 or invalid, cap at 5000
    const effectiveLimit = limit > 0 ? Math.min(limit, 5000) : 5000;
    const records = await prisma.record.findMany({
      where: { tableId, companyId: currentUser.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: effectiveLimit,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        updater: {
          select: { id: true, name: true, email: true },
        },
        dialedBy: {
          select: { id: true, name: true, email: true },
        },
        attachments: true,
      },
    });

    // Add proxied download URLs to attachments
    // Attachments keep their url because they are user-entered links, not storage secrets
    const sanitized = records.map((record) => ({
      ...record,
      attachments: record.attachments.map((att) => ({
        ...att,
        downloadUrl: `/api/attachments/${att.id}/download`,
      })),
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error fetching records:", error);
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
    const tableId = parseInt(id);
    const body = await request.json();
    const { data } = body;

    if (isNaN(tableId)) {
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

    // Check write permissions
    if (!canWriteTable(currentUser, tableId)) {
      return NextResponse.json(
        { error: "You don't have permission to write to this table" },
        { status: 403 },
      );
    }

    // SECURITY: Verify table belongs to user's company (Issue A)
    const tableCheck = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: currentUser.companyId },
      select: { id: true },
    });
    if (!tableCheck) {
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
          })),
        },
      },
    });

    await createAuditLog(record.id, currentUser.id, "CREATE", data, undefined, currentUser.companyId);

    // Trigger automations (async via Inngest)
    try {
      const table = await prisma.tableMeta.findFirst({
        where: { id: tableId, companyId: currentUser.companyId },
        select: { name: true },
      });
      await inngest.send({
        name: "automation/new-record",
        data: {
          tableId,
          tableName: table?.name || "Unknown Table",
          recordId: record.id,
          companyId: currentUser.companyId,
        },
      });
    } catch (autoError) {
      console.error("Failed to send automation event:", autoError);
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error creating record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 },
    );
  }
}
