import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleDriveFolderSelect");

const MAX_FOLDERS = 20;

async function handlePOST(request: NextRequest) {
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

    const body = await request.json();
    const folders: { id: string; name: string }[] = body.folders;

    if (!Array.isArray(folders)) {
      return NextResponse.json(
        { error: "folders must be an array" },
        { status: 400 },
      );
    }

    if (folders.length > MAX_FOLDERS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FOLDERS} folders allowed` },
        { status: 400 },
      );
    }

    // Validate each folder entry
    for (const f of folders) {
      if (!f.id || typeof f.id !== "string" || !f.name || typeof f.name !== "string") {
        return NextResponse.json(
          { error: "Each folder must have id and name strings" },
          { status: 400 },
        );
      }
    }

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

    // Replace all selected folders in a transaction
    await prisma.$transaction([
      prisma.googleDriveSelectedFolder.deleteMany({
        where: { connectionId: connection.id },
      }),
      ...folders.map((f) =>
        prisma.googleDriveSelectedFolder.create({
          data: {
            connectionId: connection.id,
            driveFolderId: f.id,
            folderName: f.name,
          },
        }),
      ),
    ]);

    return NextResponse.json({ success: true, count: folders.length });
  } catch (error) {
    log.error("Failed to select folders", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to save folder selection" },
      { status: 500 },
    );
  }
}

export const POST = withMetrics(
  "/api/integrations/google/drive/folders/select",
  handlePOST,
);
