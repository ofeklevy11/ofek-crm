import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveStatus");

async function handleGET() {
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
        selectedFolders: {
          select: { driveFolderId: true, folderName: true },
        },
      },
    });

    if (!connection || !connection.isActive) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      email: connection.googleEmail,
      selectedFolders: connection.selectedFolders.map((f) => ({
        driveFolderId: f.driveFolderId,
        folderName: f.folderName,
      })),
      isActive: connection.isActive,
    });
  } catch (error) {
    log.error("Failed to get Drive status", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to get Drive status" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics(
  "/api/integrations/google/drive/status",
  handleGET,
);
