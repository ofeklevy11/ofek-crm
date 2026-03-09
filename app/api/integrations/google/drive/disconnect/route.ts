import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import { decryptToken, revokeToken } from "@/lib/services/google-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveDisconnect");

async function handlePOST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleDriveDisconnect,
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

    if (!connection) {
      return NextResponse.json(
        { error: "No connection found" },
        { status: 404 },
      );
    }

    // Best-effort token revocation
    try {
      const refreshToken = decryptToken(
        connection.refreshTokenEnc,
        connection.refreshTokenIv,
        connection.refreshTokenTag,
      );
      await revokeToken(refreshToken);
    } catch {
      log.error("Token revocation failed (non-critical)");
    }

    // Delete connection (cascades to selectedFolders)
    await prisma.googleDriveConnection.delete({
      where: { id: connection.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to disconnect Drive", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics(
  "/api/integrations/google/drive/disconnect",
  handlePOST,
);
