import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import MeetingsPageClient from "./MeetingsPageClient";
import MeetingsBackgroundDecor from "@/components/Meetings/MeetingsBackgroundDecor";
import { CalendarDays } from "lucide-react";

export default async function MeetingsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewMeetings")) redirect("/dashboard");

  const canManage = hasUserFlag(user, "canManageMeetings");

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "radial-gradient(ellipse at center, #1a3a2a 0%, #0d1f15 100%)" }}
    >
      <MeetingsBackgroundDecor />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10 overflow-hidden" dir="rtl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/20 flex items-center justify-center text-white shadow-sm">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">פגישות</h1>
            <p className="text-sm text-white/60">ניהול פגישות, סוגים וזמינות</p>
          </div>
        </div>
        <MeetingsPageClient canManage={canManage} userPlan={user.isPremium || "basic"} />
      </div>
    </div>
  );
}
