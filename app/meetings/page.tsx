import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import MeetingsPageClient from "./MeetingsPageClient";
import { CalendarDays } from "lucide-react";

export default async function MeetingsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewMeetings")) redirect("/");

  const canManage = hasUserFlag(user, "canManageMeetings");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-sm">
          <CalendarDays className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">פגישות</h1>
          <p className="text-sm text-gray-500">ניהול פגישות, סוגים וזמינות</p>
        </div>
      </div>
      <MeetingsPageClient canManage={canManage} userPlan={user.isPremium || "basic"} />
    </div>
  );
}
