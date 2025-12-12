import { getQuotes } from "@/app/actions/quotes";
import QuotesPageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function QuotesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const quotes = await getQuotes();

  return <QuotesPageClient quotes={quotes} />;
}
