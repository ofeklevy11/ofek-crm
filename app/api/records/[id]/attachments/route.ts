import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable } from "@/lib/permissions";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recordId = parseId(id);

    if (!recordId) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { filename, url, size, displayName } = body;

    // Validate URL scheme (must be http or https)
    if (url != null && url !== "") {
      if (typeof url !== "string" || url.length > 2048 || !/^https?:\/\//i.test(url)) {
        return NextResponse.json({ error: "Invalid URL: must be http or https" }, { status: 400 });
      }
    }

    // Verify record exists and belongs to company
    const existingRecord = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
    });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const attachment = await prisma.attachment.create({
      data: {
        recordId,
        filename,
        url,
        size: size || 0,
        displayName: displayName?.trim() || null,
        uploadedBy: currentUser.id,
      },
    });

    return NextResponse.json({
      ...attachment,
      downloadUrl: `/api/attachments/${attachment.id}/download`,
    });
  } catch (error) {
    const { handlePrismaError } = await import("@/lib/prisma-error");
    return handlePrismaError(error, "attachment");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recordId = parseId(id);

    if (!recordId) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify record access
    const existingRecord = await prisma.record.findFirst({
      where: {
        id: recordId,
        companyId: currentUser.companyId,
      },
    });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (!canReadTable(currentUser, existingRecord.tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const attachments = await prisma.attachment.findMany({
      where: { recordId, record: { companyId: currentUser.companyId } },
      orderBy: { uploadedAt: "desc" },
      take: 500,
    });

    // Add proxied download URLs alongside the user-entered link URLs
    const sanitized = attachments.map((att) => ({
      ...att,
      downloadUrl: `/api/attachments/${att.id}/download`,
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 },
    );
  }
}
