import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("FilePreview");

const MAX_PREVIEW_SIZE = 10_000_000; // 10MB

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
    const fileId = parseId(id);

    if (!fileId) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        companyId: user.companyId,
      },
      select: { url: true, type: true, name: true, displayName: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found or access denied" },
        { status: 404 },
      );
    }

    // SECURITY: Validate URL host before server-side fetch to prevent SSRF
    if (!isSafeStorageUrl(file.url)) {
      return NextResponse.json(
        { error: "File storage error" },
        { status: 500 },
      );
    }

    const response = await fetch(file.url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 },
      );
    }

    // Reject responses exceeding preview size cap
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PREVIEW_SIZE) {
      return NextResponse.json({ error: "File too large for preview" }, { status: 413 });
    }

    const filename = file.displayName || file.name;
    const encodedFilename = encodeURIComponent(filename);
    const disposition = `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`;

    // Append charset=utf-8 for text/* MIME types to fix encoding issues
    let contentType = file.type || "application/octet-stream";
    if (contentType.startsWith("text/") && !contentType.includes("charset")) {
      contentType += "; charset=utf-8";
    }

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(response.body, { headers });
  } catch (error) {
    log.error("File preview error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics("/api/files/[id]/preview", handleGET);
