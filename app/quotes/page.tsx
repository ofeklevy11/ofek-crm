import { getQuotes } from "@/app/actions/quotes";
import { getBusinessSettings } from "@/app/actions/business-settings";
import QuotesPageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ trash?: string }>;
}

export default async function QuotesPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const showTrashed = params.trash === "true";
  const [{ quotes, nextCursor }, businessSettings] = await Promise.all([
    getQuotes(showTrashed),
    getBusinessSettings(),
  ]);

  return (
    <QuotesPageClient
      initialQuotes={quotes}
      initialNextCursor={nextCursor}
      showTrashed={showTrashed}
      businessSettings={businessSettings}
    />
  );
}
