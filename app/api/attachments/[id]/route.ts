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

    // Find the attachment and ensure it belongs to a record in the user's company
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        record: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    if (attachment.record.companyId !== currentUser.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.attachment.delete({
      where: { id: attachmentId },
    });

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

    // Find the attachment and ensure it belongs to a record in the user's company
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        record: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    if (attachment.record.companyId !== currentUser.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build update data
    const updateData: {
      url?: string;
      filename?: string;
      displayName?: string | null;
    } = {};

    if (url !== undefined) {
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

    const updatedAttachment = await prisma.attachment.update({
      where: { id: attachmentId },
      data: updateData,
    });

    return NextResponse.json(updatedAttachment);
  } catch (error) {
    console.error("Error updating attachment:", error);
    return NextResponse.json(
      { error: "Failed to update attachment" },
      { status: 500 },
    );
  }
}
