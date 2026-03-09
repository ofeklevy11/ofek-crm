import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  listDriveFiles,
  TokenRevokedError,
} from "@/lib/services/google-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveFiles");

const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

async function handleGET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleDriveRead,
    );
    if (rl) return rl;

    const connection = await prisma.googleDriveConnection.findUnique({
      where: {
        companyId_userId: {
          companyId: user.companyId,
          userId: user.id,
        },
      },
      include: {
        selectedFolders: true,
      },
    });

    if (!connection || !connection.isActive) {
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    const pageToken = searchParams.get("pageToken") || undefined;

    const selectedIds = connection.selectedFolders.map(
      (f) => f.driveFolderId,
    );

    // If no folderId, return the selected root folders as virtual entries
    if (!folderId) {
      return NextResponse.json({
        folders: connection.selectedFolders.map((f) => ({
          id: f.driveFolderId,
          name: f.folderName,
          _count: { files: 0 },
          totalSize: 0,
          updatedAt: f.createdAt.toISOString(),
        })),
        files: [],
        breadcrumbs: [],
      });
    }

    // Verify access and build breadcrumbs in a single parent-chain walk
    const accessToken = await getValidAccessToken(connection);
    const { hasAccess, breadcrumbs } = await verifyAccessAndBuildBreadcrumbs(
      accessToken,
      folderId,
      selectedIds,
    );
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied to this folder" },
        { status: 403 },
      );
    }

    // List files and subfolders
    const result = await listDriveFiles(accessToken, folderId, pageToken);

    const folders = result.files
      .filter((f) => f.mimeType === GOOGLE_FOLDER_MIME)
      .map((f) => ({
        id: f.id,
        name: f.name,
        _count: { files: 0 },
        totalSize: 0,
        updatedAt: f.modifiedTime || new Date().toISOString(),
      }));

    const files = result.files
      .filter((f) => f.mimeType !== GOOGLE_FOLDER_MIME)
      .map((f) => ({
        id: f.id,
        name: f.name,
        displayName: null,
        size: f.size ? parseInt(f.size, 10) : 0,
        type: f.mimeType,
        updatedAt: f.modifiedTime || new Date().toISOString(),
        createdAt: f.modifiedTime || new Date().toISOString(),
        source: "google-drive" as const,
        webViewLink: f.webViewLink || null,
        url: f.webViewLink || null,
      }));

    return NextResponse.json({
      folders,
      files,
      breadcrumbs,
      nextPageToken: result.nextPageToken,
    });
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      return NextResponse.json(
        { error: "TOKEN_REVOKED", message: "Google Drive access has been revoked. Please reconnect." },
        { status: 401 },
      );
    }
    log.error("Failed to list Drive files", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 },
    );
  }
}

async function verifyAccessAndBuildBreadcrumbs(
  accessToken: string,
  folderId: string,
  selectedIds: string[],
): Promise<{ hasAccess: boolean; breadcrumbs: { id: string; name: string }[] }> {
  // If the folder itself is a selected root, it's accessible
  if (selectedIds.includes(folderId)) {
    const params = new URLSearchParams({ fields: "id,name" });
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return { hasAccess: false, breadcrumbs: [] };
    const data = await res.json();
    return { hasAccess: true, breadcrumbs: [{ id: data.id, name: data.name }] };
  }

  // Walk up the parent chain — verify access AND collect breadcrumbs in one pass
  const crumbs: { id: string; name: string }[] = [];
  let currentId = folderId;
  const maxDepth = 20;

  for (let i = 0; i < maxDepth; i++) {
    const params = new URLSearchParams({ fields: "id,name,parents" });
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${currentId}?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) return { hasAccess: false, breadcrumbs: [] };
    const data = await res.json();
    crumbs.unshift({ id: data.id, name: data.name });

    // Reached a selected root folder — access verified
    if (selectedIds.includes(data.id)) {
      return { hasAccess: true, breadcrumbs: crumbs };
    }

    const parents: string[] = data.parents || [];
    if (parents.length === 0) break;
    currentId = parents[0];
  }

  return { hasAccess: false, breadcrumbs: [] };
}

export const GET = withMetrics(
  "/api/integrations/google/drive/files",
  handleGET,
);
