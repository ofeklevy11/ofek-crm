import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || !hasUserFlag(user, "canViewUsers")) {
    redirect("/");
  }

  return <>{children}</>;
}
