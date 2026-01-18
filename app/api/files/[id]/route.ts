import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fileId = parseInt(id);
    const body = await request.json();
    const { displayName } = body;

    if (isNaN(fileId)) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Update the file
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: {
        displayName: displayName?.trim() || null,
      },
    });

    return NextResponse.json(updatedFile);
  } catch (error) {
    console.error("Error updating file:", error);
    return NextResponse.json(
      { error: "Failed to update file" },
      { status: 500 },
    );
  }
}
