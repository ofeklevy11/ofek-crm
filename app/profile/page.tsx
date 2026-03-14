import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import ProfileContent from "./ProfileContent";

export const metadata: Metadata = { title: "פרופיל" };

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <ProfileContent user={user} />
    </div>
  );
}
