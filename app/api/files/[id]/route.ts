import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PUT(
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

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { displayName } = body;

    // Verify the file exists and belongs to user's company
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        companyId: currentUser.companyId,
      },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // SECURITY: Atomic companyId check in update WHERE clause
    const updatedFile = await prisma.file.update({
      where: { id: fileId, companyId: currentUser.companyId },
      data: {
        displayName: displayName?.trim() || null,
      },
    });

    const { url: _u, key: _k, ...safeFile } = updatedFile as any;
    return NextResponse.json({ ...safeFile, downloadUrl: `/api/files/${fileId}/download` });
  } catch (error) {
    console.error("Error updating file:", error);
    return NextResponse.json(
      { error: "Failed to update file" },
      { status: 500 },
    );
  }
}
