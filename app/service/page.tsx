// Service Page
import type { Metadata } from "next";
import {
  getTickets,
  getSlaPolicies,
  getTicketStats,
  getServiceUsers,
} from "@/app/actions/tickets";
import { getClients } from "@/app/actions/clients";
import ServicePageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export const metadata: Metadata = {
  title: "שירות לקוחות",
};

export default async function ServicePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  let ticketsResult, clients, slaPolicies, stats, users;
  try {
    // P7: All queries go through server actions (bounded + cacheable)
    [ticketsResult, clients, slaPolicies, stats, users] = await Promise.all([
      getTickets(),
      getClients(),
      getSlaPolicies(),
      getTicketStats(),
      getServiceUsers(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  return (
    <ServicePageClient
      initialTickets={ticketsResult.items}
      users={users}
      clients={clients}
      initialSlaPolicies={slaPolicies}
      ticketStats={stats}
      currentUser={{ id: user.id, role: user.role }}
    />
  );
}
