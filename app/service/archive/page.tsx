import { getClosedTickets } from "@/app/actions/closed-tickets";
import ClosedTicketsClient from "./client";

export default async function ClosedTicketsArchivePage() {
  const { items: tickets } = await getClosedTickets();

  return <ClosedTicketsClient initialTickets={tickets} />;
}
