import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { NurtureQuotaProvider } from "@/components/nurture/NurtureQuotaContext";
import type { UserTier } from "@/lib/nurture-rate-limit";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "טיפוח לקוחות | BizlyCRM" };

export default async function NurtureHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || !hasUserFlag(user, "canViewNurtureHub")) {
    redirect("/dashboard");
  }

  const tier = (user.isPremium as UserTier) || "basic";

  return (
    <NurtureQuotaProvider tier={tier}>
      {children}
    </NurtureQuotaProvider>
  );
}
