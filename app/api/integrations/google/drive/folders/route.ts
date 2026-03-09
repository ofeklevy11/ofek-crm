import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  listDriveFolders,
  TokenRevokedError,
} from "@/lib/services/google-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveFolders");

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
    });

    if (!connection || !connection.isActive) {
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId") || "root";

    const accessToken = await getValidAccessToken(connection);
    const folders = await listDriveFolders(accessToken, parentId);

    return NextResponse.json({
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
    });
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      return NextResponse.json(
        { error: "TOKEN_REVOKED", message: "Google Drive access has been revoked. Please reconnect." },
        { status: 401 },
      );
    }
    log.error("Failed to list Drive folders", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to list folders" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics(
  "/api/integrations/google/drive/folders",
  handleGET,
);
