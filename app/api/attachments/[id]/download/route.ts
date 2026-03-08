import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AttachmentDownload");

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(user, "canViewFiles")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.fileRead);
    if (rateLimited) return rateLimited;

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

    // SECURITY: Only proxy requests to known safe storage hosts to prevent SSRF.
    // Reject non-whitelisted URLs instead of redirecting (prevents open redirect).
    if (!isSafeStorageUrl(attachment.url)) {
      return NextResponse.json(
        { error: "Unsupported file storage URL" },
        { status: 400 },
      );
    }

    const response = await fetch(attachment.url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 },
      );
    }

    // Reject responses exceeding 50MB to prevent bandwidth/memory exhaustion
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 50_000_000) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

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
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
      zip: "application/zip",
    };
    // SVG served as octet-stream to prevent browser executing embedded JS
    const contentType = ext === "svg"
      ? "application/octet-stream"
      : (ext && mimeMap[ext]) || "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    // Forward Content-Length from upstream if available
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    // Stream the response body directly instead of buffering into memory
    return new NextResponse(response.body, { headers });
  } catch (error) {
    log.error("Attachment download error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics("/api/attachments/[id]/download", handleGET);
