"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

export async function getClients() {
  const user = await getCurrentUser();
  if (!user) return [];

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
  });
}
