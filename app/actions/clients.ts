"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getClients() {
  const user = await getCurrentUser();
  if (!user) return [];

  // P133: Add take limit to bound client list query
  return await prisma.client.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
    },
    orderBy: { name: "asc" },
    take: 2000,
  });
}
