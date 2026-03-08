import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("FilesAPI");

const MAX_DISPLAY_NAME_LENGTH = 255;

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function handlePUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fileId = parseId(id);

    if (!fileId) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasUserFlag(currentUser, "canViewFiles")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimited = await checkRateLimit(String(currentUser.id), RATE_LIMITS.fileMutation);
    if (rateLimited) return rateLimited;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { displayName } = body;

    // Validate displayName
    if (displayName !== undefined && displayName !== null) {
      if (typeof displayName !== "string" || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
      }
    }

    // SECURITY: Atomic companyId check in update WHERE clause + explicit select
    try {
      const updatedFile = await prisma.file.update({
        where: { id: fileId, companyId: currentUser.companyId },
        data: {
          displayName: displayName?.trim() || null,
        },
        select: {
          id: true, name: true, displayName: true, size: true, type: true,
          folderId: true, recordId: true,
          createdAt: true, updatedAt: true,
        },
      });

      return NextResponse.json({ ...updatedFile, downloadUrl: `/api/files/${fileId}/download` });
    } catch (e: any) {
      if (e?.code === "P2025") {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      throw e;
    }
  } catch (error) {
    log.error("Failed to update file", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update file" },
      { status: 500 },
    );
  }
}

export const PUT = withMetrics("/api/files/[id]", handlePUT);
