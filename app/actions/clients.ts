"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";

export async function getClients() {
  const user = await getCurrentUser();
  if (!user) return [];

  // P133: Add take limit to bound client list query
  return await withRetry(() => prisma.client.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      businessName: true,
    },
    orderBy: { name: "asc" },
    take: 2000,
  }));
}
