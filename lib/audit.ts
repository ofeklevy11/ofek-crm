import { prisma } from "@/lib/prisma";

export async function createAuditLog(
  recordId: number | null,
  userId: number | null,
  action: string,
  diffJson: any = null
) {
  try {
    await prisma.auditLog.create({
      data: {
        recordId,
        userId,
        action,
        diffJson: diffJson ? diffJson : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
    // Don't throw, just log error so main action succeeds
  }
}
