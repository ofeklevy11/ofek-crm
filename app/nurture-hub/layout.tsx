import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function NurtureHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || !hasUserFlag(user, "canViewNurtureHub")) {
    redirect("/");
  }

  return <>{children}</>;
}
