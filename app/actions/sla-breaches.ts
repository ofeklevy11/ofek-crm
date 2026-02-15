"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { SlaBreachStatus } from "@prisma/client";

// P5: Derive validation from Prisma enum (single source of truth)
const VALID_BREACH_STATUSES = new Set<string>(Object.values(SlaBreachStatus));

const PAGE_SIZE = 100;

// P2: Cursor-based pagination
export async function getSlaBreaches(cursor?: number) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const items = await prisma.slaBreach.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: { companyId: user.companyId },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            assignee: {
              select: { name: true },
            },
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
    console.error("Error fetching SLA breaches:", error);
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
    });
    return { success: true, data: breach };
  } catch (error) {
    console.error("Error updating SLA breach:", error);
    return { success: false, error: "Failed to update SLA breach" };
  }
}
