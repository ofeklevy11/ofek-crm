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
    const limit = parseInt(url.searchParams.get("limit") || "0") || 0;

    if (forPicker) {
      // Lightweight mode for RelationPicker: only id + data, with optional search
      let records;
      if (searchQuery) {
        // Server-side ILIKE search on JSON data
        records = await prisma.$queryRaw<{ id: number; data: any }[]>`
          SELECT id, data FROM "Record"
          WHERE "tableId" = ${tableId}
          AND "companyId" = ${currentUser.companyId}
          AND "data"::text ILIKE ${`%${searchQuery}%`}
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
    const records = await prisma.record.findMany({
      where: { tableId, companyId: currentUser.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(limit > 0 ? { take: limit } : {}),
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

    return NextResponse.json(records);
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

    await createAuditLog(record.id, currentUser.id, "CREATE", data);

    // Trigger automations (async via Inngest)
    try {
      const table = await prisma.tableMeta.findUnique({
        where: { id: tableId },
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
