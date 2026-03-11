import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";

export default async function MeetingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewMeetings")) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
