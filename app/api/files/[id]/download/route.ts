import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { createLogger } from "@/lib/logger";

const log = createLogger("FileDownload");

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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

    // Fetch the file and verify it belongs to the user's company
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        companyId: user.companyId,
      },
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

    // Fetch the file content from the external URL
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

    // Determine the filename to use for download
    const downloadFilename = file.displayName || file.name;
    const encodedFilename = encodeURIComponent(downloadFilename);

    // Stream the response body directly instead of buffering into memory
    const headers: Record<string, string> = {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    // Reject responses exceeding 50MB to prevent bandwidth exhaustion
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 50_000_000) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    // Forward Content-Length from upstream if available
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(response.body, { headers });
  } catch (error) {
    log.error("File download error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
