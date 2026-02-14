import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const attachmentId = parseInt(id);

    if (isNaN(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachment ID" },
        { status: 400 },
      );
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Atomic delete scoped to company — eliminates TOCTOU
    const { count } = await prisma.attachment.deleteMany({
      where: {
        id: attachmentId,
        record: { companyId: currentUser.companyId },
      },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const attachmentId = parseInt(id);
    const body = await request.json();
    const { url, displayName } = body;

    if (isNaN(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachment ID" },
        { status: 400 },
      );
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build update data (before transaction to avoid holding locks during validation)
    const updateData: {
      url?: string;
      filename?: string;
      displayName?: string | null;
    } = {};

    if (url !== undefined) {
      // Validate URL: only allow http/https, max 2048 chars
      if (typeof url !== "string" || url.length > 2048) {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { error: "URL must start with http:// or https://" },
          { status: 400 },
        );
      }
      updateData.url = url;
      // Update filename from URL
      let filename = url.replace(/^https?:\/\//i, "");
      if (filename.includes("/")) {
        filename = filename.split("/").pop() || filename;
      }
      if (!filename || filename.length === 0) filename = "link";
      updateData.filename = filename;
    }

    // Allow displayName to be set to null (empty string converts to null)
    if (displayName !== undefined) {
      updateData.displayName = displayName?.trim() || null;
    }

    // RepeatableRead transaction eliminates TOCTOU between ownership check and update
    const updatedAttachment = await prisma.$transaction(
      async (tx) => {
        const att = await tx.attachment.findFirst({
          where: { id: attachmentId, record: { companyId: currentUser.companyId } },
          include: { record: true },
        });
        if (!att) return null;

        return tx.attachment.update({
          where: { id: attachmentId },
          data: updateData,
        });
      },
      { isolationLevel: "RepeatableRead" },
    );

    if (!updatedAttachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedAttachment);
  } catch (error) {
    console.error("Error updating attachment:", error);
    return NextResponse.json(
      { error: "Failed to update attachment" },
      { status: 500 },
    );
  }
}
