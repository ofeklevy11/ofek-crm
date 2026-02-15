import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const attachmentId = parseId(id);

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Invalid attachment ID" },
        { status: 400 },
      );
    }

    // Fetch the attachment — scoped by companyId via record relation
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, record: { companyId: user.companyId } },
      include: {
        record: { select: { companyId: true } },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found or access denied" },
        { status: 404 },
      );
    }

    // Only proxy requests to known safe storage hosts.
    // For user-entered URLs, redirect the client directly to avoid SSRF.
    const SAFE_HOSTS = ["utfs.io", "uploadthing.com", "ufs.sh"];
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(attachment.url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const isSafeHost = SAFE_HOSTS.some(
      (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`),
    );

    if (!isSafeHost) {
      // Redirect client directly — don't proxy user-entered URLs through the server
      return NextResponse.redirect(attachment.url);
    }

    const response = await fetch(attachment.url, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 },
      );
    }

    const fileBuffer = await response.arrayBuffer();
    const downloadFilename =
      attachment.displayName || attachment.filename || "download";
    const encodedFilename = encodeURIComponent(downloadFilename);

    // Infer content-type from filename extension
    const ext = downloadFilename.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
      zip: "application/zip",
    };
    const contentType = (ext && mimeMap[ext]) || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(fileBuffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Attachment download error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
