import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canWriteTable } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AttachmentsAPI");

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function handleDELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const attachmentId = parseId(id);

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Invalid attachment ID" },
        { status: 400 },
      );
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlDel = await checkRateLimit(String(currentUser.id), RATE_LIMITS.fileMutation);
    if (rlDel) return rlDel;

    // Fetch attachment to check table-level write permission
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, record: { companyId: currentUser.companyId } },
      select: { id: true, record: { select: { tableId: true } } },
    });
    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }
    if (!canWriteTable(currentUser, attachment.record.tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.attachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete attachment", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 },
    );
  }
}

async function handlePUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const attachmentId = parseId(id);

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Invalid attachment ID" },
        { status: 400 },
      );
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlPut = await checkRateLimit(String(currentUser.id), RATE_LIMITS.fileMutation);
    if (rlPut) return rlPut;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { url, displayName } = body;

    // Build update data (before transaction to avoid holding locks during validation)
    const updateData: {
      url?: string;
      filename?: string;
      displayName?: string | null;
    } = {};

    if (url !== undefined) {
      // Validate URL: only allow http/https, max 2048 chars
      if (typeof url !== "string" || url.length > 2048) {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { error: "URL must start with http:// or https://" },
          { status: 400 },
        );
      }
      const { isPrivateUrl } = await import("@/lib/security/ssrf");
      if (isPrivateUrl(url)) {
        return NextResponse.json({ error: "URL targets a private address" }, { status: 400 });
      }
      updateData.url = url;
      // Update filename from URL
      let filename = url.replace(/^https?:\/\//i, "");
      if (filename.includes("/")) {
        filename = filename.split("/").pop() || filename;
      }
      if (!filename || filename.length === 0) filename = "link";
      updateData.filename = filename;
    }

    // Allow displayName to be set to null (empty string converts to null)
    if (displayName !== undefined) {
      updateData.displayName = displayName?.trim() || null;
    }

    // RepeatableRead transaction eliminates TOCTOU between ownership check and update
    const updatedAttachment = await prisma.$transaction(
      async (tx) => {
        const att = await tx.attachment.findFirst({
          where: { id: attachmentId, record: { companyId: currentUser.companyId } },
          include: { record: { select: { tableId: true } } },
        });
        if (!att) return null;
        if (!canWriteTable(currentUser, att.record.tableId)) return null;

        return tx.attachment.update({
          where: { id: attachmentId },
          data: updateData,
          select: { id: true, recordId: true, filename: true, url: true, size: true, displayName: true, uploadedAt: true },
        });
      },
      { isolationLevel: "RepeatableRead" },
    );

    if (!updatedAttachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedAttachment);
  } catch (error) {
    log.error("Failed to update attachment", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update attachment" },
      { status: 500 },
    );
  }
}

export const DELETE = withMetrics("/api/attachments/[id]", handleDELETE);
export const PUT = withMetrics("/api/attachments/[id]", handlePUT);
