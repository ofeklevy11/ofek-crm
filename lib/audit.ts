import { prisma } from "@/lib/prisma";

export async function createAuditLog(
  recordId: number | null,
  userId: number | null,
  action: string,
  diffJson: any = null,
  tx: any = prisma,
) {
  try {
    await tx.auditLog.create({
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

export async function createAuditLogsBatch(
  logs: {
    recordId: number | null;
    userId: number | null;
    action: string;
    diffJson?: any;
  }[],
  tx: any = prisma,
) {
  try {
    if (logs.length === 0) return;

    await tx.auditLog.createMany({
      data: logs.map((log) => ({
        recordId: log.recordId,
        userId: log.userId,
        action: log.action,
        diffJson: log.diffJson ? log.diffJson : undefined,
      })),
    });
  } catch (error) {
    console.error("Failed to create audit logs batch:", error);
  }
}
