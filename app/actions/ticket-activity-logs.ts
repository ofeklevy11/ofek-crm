"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasUserFlag } from "@/lib/permissions";
import { withRetry } from "@/lib/db-retry";

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

  // P1-2: Single query with relation filter (verifies company ownership inline)
  return await withRetry(() => prisma.ticketActivityLog.findMany({
    where: { ticketId, ticket: { companyId: user.companyId } },
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
  }));
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

  // P2-1: Single atomic deleteMany — no TOCTOU gap, no redundant findFirst
  const { count } = await withRetry(() => prisma.ticketActivityLog.deleteMany({
    where: { id: logId, ticket: { companyId: user.companyId } },
  }));

  if (count === 0) throw new Error("Unauthorized");

  revalidatePath("/service");
  revalidatePath("/service/archive");
}
