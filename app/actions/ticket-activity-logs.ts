"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasUserFlag } from "@/lib/permissions";

// Get activity logs for a ticket
export async function getTicketActivityLogs(ticketId: number) {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!hasUserFlag(user as any, "canViewServiceCalls")) {
    throw new Error("Unauthorized");
  }
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    throw new Error("Rate limit exceeded");
  }

  // First verify the ticket belongs to the user's company
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, companyId: user.companyId },
    select: { id: true },
  });

  if (!ticket) {
    return [];
  }

  return await prisma.ticketActivityLog.findMany({
    where: { ticketId },
    select: {
      id: true,
      ticketId: true,
      fieldName: true,
      fieldLabel: true,
      oldValue: true,
      newValue: true,
      oldLabel: true,
      newLabel: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

// Delete an activity log (admin only)
export async function deleteTicketActivityLog(logId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user as any, "canViewServiceCalls")) {
    throw new Error("Unauthorized");
  }
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Only admin can delete activity logs
  if (user.role !== "admin") {
    throw new Error("רק מנהל יכול למחוק לוגים");
  }

  // Find the log to verify it belongs to the user's company
  const log = await prisma.ticketActivityLog.findFirst({
    where: { id: logId, ticket: { companyId: user.companyId } },
    select: { id: true },
  });

  if (!log) {
    throw new Error("Unauthorized");
  }

  // SECURITY: Scope delete via ticket companyId join to prevent TOCTOU
  await prisma.ticketActivityLog.deleteMany({
    where: { id: logId, ticket: { companyId: user.companyId } },
  });

  revalidatePath("/service");
  revalidatePath("/service/archive");
}
