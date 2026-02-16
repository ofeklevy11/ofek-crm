import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable, canWriteTable, hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("RecordAttachments");

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

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.fileMutation);
    if (rl) return rl;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { filename, url, size, displayName } = body;

    // Validate filename
    if (typeof filename !== "string" || filename.length === 0 || filename.length > 500) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Validate size (non-negative integer)
    if (size != null && (typeof size !== "number" || !Number.isFinite(size) || size < 0)) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
    }

    // Validate displayName
    if (displayName != null && (typeof displayName !== "string" || displayName.length > 500)) {
      return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
    }

    // Validate URL scheme (must be http or https)
    if (url != null && url !== "") {
      if (typeof url !== "string" || url.length > 2048 || !/^https?:\/\//i.test(url)) {
        return NextResponse.json({ error: "Invalid URL: must be http or https" }, { status: 400 });
      }
      const { isPrivateUrl } = await import("@/lib/security/ssrf");
      if (isPrivateUrl(url)) {
        return NextResponse.json({ error: "URL targets a private address" }, { status: 400 });
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

    if (!hasUserFlag(currentUser, "canViewFiles")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!canWriteTable(currentUser, existingRecord.tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      select: { id: true, recordId: true, filename: true, url: true, size: true, displayName: true, uploadedAt: true },
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

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.fileRead);
    if (rl) return rl;

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
      select: { id: true, recordId: true, filename: true, url: true, size: true, displayName: true, uploadedAt: true },
    });

    // Add proxied download URLs alongside the user-entered link URLs
    const sanitized = attachments.map((att) => ({
      ...att,
      downloadUrl: `/api/attachments/${att.id}/download`,
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    log.error("Failed to fetch attachments", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 },
    );
  }
}
