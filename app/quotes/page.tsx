import type { Metadata } from "next";
import { getQuotes } from "@/app/actions/quotes";
import { getBusinessSettings } from "@/app/actions/business-settings";
import QuotesPageClient from "./client";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export const metadata: Metadata = { title: "הצעות מחיר" };

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

  let quotesResult, businessSettings;
  try {
    [quotesResult, businessSettings] = await Promise.all([
      getQuotes(showTrashed),
      getBusinessSettings(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  const { quotes, nextCursor } = quotesResult;

  return (
    <QuotesPageClient
      initialQuotes={quotes as any}
      initialNextCursor={nextCursor}
      showTrashed={showTrashed}
      businessSettings={businessSettings}
    />
  );
}
