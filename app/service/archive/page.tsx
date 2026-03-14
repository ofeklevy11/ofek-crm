import type { Metadata } from "next";
import { getClosedTickets } from "@/app/actions/closed-tickets";
import ClosedTicketsClient from "./client";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export const metadata: Metadata = {
  title: "ארכיון פניות",
};

export default async function ClosedTicketsArchivePage() {
  let tickets;
  try {
    const result = await getClosedTickets();
    tickets = result.items;
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  return <ClosedTicketsClient initialTickets={tickets} />;
}
