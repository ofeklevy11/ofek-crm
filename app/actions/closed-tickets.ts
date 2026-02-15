"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";
import { TicketStatus } from "@prisma/client";
import { withRetry } from "@/lib/db-retry";

async function invalidateServiceStatsCache(companyId: number) {
  try {
    await redis.del(`cache:metric:service:stats:${companyId}`);
  } catch {}
}

const PAGE_SIZE = 100;

// P2: Cursor-based pagination
export async function getClosedTickets(cursor?: number) {
  const user = await getCurrentUser();
  if (!user) return { items: [] as any[], nextCursor: null as number | null };

  const items = await withRetry(() =>
    prisma.ticket.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: {
        companyId: user.companyId,
        status: "CLOSED",
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    })
  );

  let nextCursor: number | null = null;
  if (items.length > PAGE_SIZE) {
    items.pop();
    nextCursor = items[items.length - 1].id;
  }

  return { items, nextCursor };
}

export async function restoreTicket(id: number, newStatus: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Valid statuses to restore to (subset of TicketStatus)
  const validRestoreStatuses = new Set(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"]);
  if (!validRestoreStatuses.has(newStatus)) {
    throw new Error("Invalid status");
  }

  const statusLabels: Record<string, string> = {
    OPEN: "פתוח",
    IN_PROGRESS: "בטיפול",
    WAITING: "ממתין",
    RESOLVED: "טופל",
    CLOSED: "סגור",
  };

  // Transaction: status update + activity log atomically
  await prisma.$transaction(async (tx) => {
    // P1: Acquire row-level lock to prevent concurrent modifications
    const locked: { id: number }[] = await tx.$queryRawUnsafe(
      `SELECT id FROM "Ticket" WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      id,
      user.companyId,
    );
    if (locked.length === 0) throw new Error("Unauthorized");

    const ticket = await tx.ticket.findFirst({
      where: { id, companyId: user.companyId },
      select: { companyId: true, status: true, priority: true, assigneeId: true },
    });

    if (!ticket) {
      throw new Error("Unauthorized");
    }

    const oldStatus = ticket.status;

    // Build status update data — clear assignee if they no longer exist
    const statusUpdateData: Record<string, any> = { status: newStatus as TicketStatus };

    if (ticket.assigneeId) {
      const assigneeExists = await tx.user.findFirst({
        where: { id: ticket.assigneeId, companyId: user.companyId },
        select: { id: true },
      });
      if (!assigneeExists) {
        statusUpdateData.assigneeId = null;
      }
    }

    await tx.ticket.update({
      where: { id, companyId: user.companyId },
      data: statusUpdateData,
    });

    // Recalculate SLA dates from policy for the restored ticket
    if (ticket.priority) {
      const slaPolicy = await tx.slaPolicy.findUnique({
        where: {
          companyId_priority: {
            companyId: user.companyId,
            priority: ticket.priority,
          },
        },
      });

      if (slaPolicy) {
        const now = Date.now();
        const slaUpdate: { slaDueDate?: Date; slaResponseDueDate?: Date } = {};

        if (slaPolicy.resolveTimeMinutes) {
          slaUpdate.slaDueDate = new Date(now + slaPolicy.resolveTimeMinutes * 60 * 1000);
        }
        if (newStatus === "OPEN" && slaPolicy.responseTimeMinutes) {
          slaUpdate.slaResponseDueDate = new Date(now + slaPolicy.responseTimeMinutes * 60 * 1000);
        }

        if (Object.keys(slaUpdate).length > 0) {
          await tx.ticket.update({
            where: { id, companyId: user.companyId },
            data: slaUpdate,
          });
        }
      }
    }

    // Log the restore action
    await tx.ticketActivityLog.create({
      data: {
        ticketId: id,
        userId: user.id,
        fieldName: "status",
        fieldLabel: "סטטוס",
        oldValue: oldStatus,
        newValue: newStatus,
        oldLabel: statusLabels[oldStatus] || oldStatus,
        newLabel: statusLabels[newStatus] || newStatus,
      },
    });
  }, { maxWait: 5000, timeout: 10000 });

  await invalidateServiceStatsCache(user.companyId);
  revalidatePath("/service");
  revalidatePath("/service/archive");
}

// P6: Atomic delete — no TOCTOU gap, cascade handled by DB foreign key constraints
export async function permanentlyDeleteTicket(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const { count } = await withRetry(() =>
    prisma.ticket.deleteMany({
      where: { id, companyId: user.companyId },
    })
  );

  if (count === 0) throw new Error("Ticket not found");

  await invalidateServiceStatsCache(user.companyId);
  revalidatePath("/service");
  revalidatePath("/service/archive");
}
