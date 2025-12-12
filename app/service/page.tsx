// Service Page
import { getTickets, getSlaPolicies } from "@/app/actions/tickets";
import { getClients } from "@/app/actions/clients";
import ServicePageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ServicePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [tickets, clients, slaPolicies] = await Promise.all([
    getTickets(),
    getClients(),
    getSlaPolicies(),
  ]);

  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true },
  });

  return (
    <ServicePageClient
      initialTickets={tickets}
      users={users}
      clients={clients}
      initialSlaPolicies={slaPolicies}
    />
  );
}
