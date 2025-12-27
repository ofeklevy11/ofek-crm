"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getSlaBreaches() {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const breaches = await prisma.slaBreach.findMany({
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
      orderBy: { breachedAt: "desc" },
    });

    return { success: true, data: breaches };
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

  try {
    const breach = await prisma.slaBreach.update({
      where: { id, companyId: user.companyId },
      data: {
        status,
        notes,
      },
    });
    return { success: true, data: breach };
  } catch (error) {
    console.error("Error updating SLA breach:", error);
    return { success: false, error: "Failed to update SLA breach" };
  }
}
