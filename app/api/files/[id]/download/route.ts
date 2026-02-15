import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Only proxy requests to known safe storage hosts to prevent SSRF
const SAFE_HOSTS = ["utfs.io", "uploadthing.com", "ufs.sh"];

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
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(file.url);
    } catch {
      return NextResponse.json({ error: "File storage error" }, { status: 500 });
    }

    const isSafeHost = SAFE_HOSTS.some(
      (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`),
    );

    if (!isSafeHost) {
      return NextResponse.json(
        { error: "File storage error" },
        { status: 500 },
      );
    }

    // Fetch the file content from the external URL
    const response = await fetch(file.url, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 },
      );
    }

    const fileBuffer = await response.arrayBuffer();

    // Determine the filename to use for download
    const downloadFilename = file.displayName || file.name;

    // Encode filename properly for Content-Disposition header
    const encodedFilename = encodeURIComponent(downloadFilename);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(fileBuffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("File download error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
