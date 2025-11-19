import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, recordIds } = body;

    if (!recordIds || !Array.isArray(recordIds)) {
      return NextResponse.json(
        { error: "Invalid record IDs" },
        { status: 400 }
      );
    }

    if (action === "delete") {
      // Log before delete or after? After is better but we lose data.
      // For bulk delete, we might just log IDs.

      const count = await prisma.record.deleteMany({
        where: {
          id: {
            in: recordIds.map((id: any) => Number(id)),
          },
        },
      });

      // Log bulk delete
      for (const id of recordIds) {
        await createAuditLog(Number(id), null, "DELETE (BULK)");
      }

      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
