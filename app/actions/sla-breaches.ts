"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { SlaBreachStatus } from "@prisma/client";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasUserFlag } from "@/lib/permissions";
import { createLogger } from "@/lib/logger";

const log = createLogger("SlaBreaches");

const MAX_NOTES = 2_000;

// P5: Derive validation from Prisma enum (single source of truth)
const VALID_BREACH_STATUSES = new Set<string>(Object.values(SlaBreachStatus));

const PAGE_SIZE = 100;

// P2: Cursor-based pagination
export async function getSlaBreaches(cursor?: number) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user as any, "canViewServiceCalls")) {
    return { success: false, error: "Unauthorized" };
  }
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceRead)) {
    return { success: false, error: "Rate limit exceeded" };
  }

  try {
    const items = await prisma.slaBreach.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: { companyId: user.companyId },
      select: {
        id: true,
        ticketId: true,
        priority: true,
        slaDueDate: true,
        breachType: true,
        breachedAt: true,
        status: true,
        notes: true,
        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            assignee: { select: { name: true } },
          },
        },
      },
      orderBy: [{ breachedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });

    let nextCursor: number | null = null;
    if (items.length > PAGE_SIZE) {
      items.pop();
      nextCursor = items[items.length - 1].id;
    }

    return { success: true, data: { items, nextCursor } };
  } catch (error) {
    log.error("Error fetching SLA breaches", { error: String(error) });
    return { success: false, error: "Failed to fetch SLA breaches" };
  }
}

export async function updateSlaBreachStatus(
  id: number,
  status: string,
  notes?: string
) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user as any, "canViewServiceCalls")) {
    return { success: false, error: "Unauthorized" };
  }
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.serviceMutation)) {
    return { success: false, error: "Rate limit exceeded" };
  }
  if (notes && notes.length > MAX_NOTES) {
    return { success: false, error: "Notes too long" };
  }

  // P5: Validate breach status against enum
  if (!VALID_BREACH_STATUSES.has(status)) {
    return { success: false, error: "Invalid status" };
  }

  try {
    const breach = await prisma.slaBreach.update({
      where: { id, companyId: user.companyId },
      data: {
        status: status as SlaBreachStatus,
        notes,
      },
      select: {
        id: true,
        ticketId: true,
        priority: true,
        slaDueDate: true,
        breachType: true,
        breachedAt: true,
        status: true,
        notes: true,
      },
    });
    return { success: true, data: breach };
  } catch (error) {
    log.error("Error updating SLA breach", { error: String(error) });
    return { success: false, error: "Failed to update SLA breach" };
  }
}
