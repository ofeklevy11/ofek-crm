import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  getDriveFileMeta,
  downloadDriveFile,
  isGoogleDocsType,
  getExportExtension,
  TokenRevokedError,
} from "@/lib/services/google-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveDownload");

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50MB

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleDriveDownload,
    );
    if (rl) return rl;

    const { fileId } = await params;

    const connection = await prisma.googleDriveConnection.findUnique({
      where: {
        companyId_userId: {
          companyId: user.companyId,
          userId: user.id,
        },
      },
    });

    if (!connection || !connection.isActive) {
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(connection);

    // Get file metadata
    const meta = await getDriveFileMeta(accessToken, fileId);

    // Check size for regular files
    if (meta.size && parseInt(meta.size as string, 10) > MAX_DOWNLOAD_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50MB)" },
        { status: 413 },
      );
    }

    // Download or export the file
    const downloadRes = await downloadDriveFile(
      accessToken,
      fileId,
      meta.mimeType,
    );

    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      log.error("Drive download failed", {
        status: downloadRes.status,
        body: text,
      });
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: 502 },
      );
    }

    // Determine filename
    let filename = meta.name;
    if (isGoogleDocsType(meta.mimeType)) {
      const ext = getExportExtension(meta.mimeType);
      if (ext && !filename.endsWith(ext)) {
        filename += ext;
      }
    }

    const body = downloadRes.body;
    if (!body) {
      return NextResponse.json(
        { error: "Empty response from Drive" },
        { status: 502 },
      );
    }

    const contentType =
      downloadRes.headers.get("content-type") || "application/octet-stream";

    return new NextResponse(body as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      return NextResponse.json(
        { error: "TOKEN_REVOKED", message: "Google Drive access has been revoked. Please reconnect." },
        { status: 401 },
      );
    }
    log.error("Failed to download Drive file", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics(
  "/api/integrations/google/drive/files/[fileId]/download",
  handleGET,
);
