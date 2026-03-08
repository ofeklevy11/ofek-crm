"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import MeetingsList from "@/components/Meetings/MeetingsList";
import MeetingsCalendar from "@/components/Meetings/MeetingsCalendar";
import MeetingTypesList from "@/components/Meetings/MeetingTypesList";
import AvailabilityEditor from "@/components/Meetings/AvailabilityEditor";
import AvailabilityBlocksList from "@/components/Meetings/AvailabilityBlocksList";
import GlobalMeetingAutomationsModal from "@/components/Meetings/GlobalMeetingAutomationsModal";
import { CalendarDays, List, Layers, Clock, Zap } from "lucide-react";

interface MeetingsPageClientProps {
  canManage: boolean;
  userPlan: string;
}

export default function MeetingsPageClient({ canManage, userPlan }: MeetingsPageClientProps) {
  const [meetingTypes, setMeetingTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [stats, setStats] = useState<{ total: number; pending: number; confirmed: number; completed: number; noShow: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [
          { getMeetingTypes, getMeetingStats },
          { getCompanyAvailability, getAvailabilityBlocks },
        ] = await Promise.all([
          import("@/app/actions/meetings"),
          import("@/app/actions/availability"),
        ]);

        const [typesRes, availRes, blocksRes, statsRes] = await Promise.all([
          getMeetingTypes(),
          getCompanyAvailability(),
          getAvailabilityBlocks(),
          getMeetingStats("month").catch(() => null),
        ]);

        if (typesRes.success) setMeetingTypes(typesRes.data || []);
        if (availRes.success) setAvailability(availRes.data);
        if (blocksRes.success) setBlocks(blocksRes.data || []);

        if (statsRes?.success && statsRes.data) {
          const d = statsRes.data;
          setStats({
            total: d.total,
            pending: d.byStatus?.["PENDING"] || 0,
            confirmed: d.byStatus?.["CONFIRMED"] || 0,
            completed: d.byStatus?.["COMPLETED"] || 0,
            noShow: d.byStatus?.["NO_SHOW"] || 0,
          });
        }
      } catch {
        // Errors handled by individual components
      }
      setLoading(false);
    })();
  }, []);

  const handleSaveAvailability = async (data: any) => {
    const { updateCompanyAvailability } = await import("@/app/actions/availability");
    return updateCompanyAvailability(data);
  };

  const handleAddBlock = async (data: any) => {
    const { createAvailabilityBlock } = await import("@/app/actions/availability");
    const result = await createAvailabilityBlock(data);
    if (result.success) {
      const { getAvailabilityBlocks } = await import("@/app/actions/availability");
      const blocksRes = await getAvailabilityBlocks();
      if (blocksRes.success) setBlocks(blocksRes.data || []);
    }
    return result;
  };

  const handleDeleteBlock = async (id: number) => {
    const { deleteAvailabilityBlock } = await import("@/app/actions/availability");
    const result = await deleteAvailabilityBlock(id);
    if (result.success) {
      setBlocks(prev => prev.filter(b => b.id !== id));
    }
    return result;
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/20 bg-[#162e22] p-3 space-y-2">
              <div className="h-3 w-16 mtg-dark-skeleton" />
              <div className="h-7 w-12 mtg-dark-skeleton" />
            </div>
          ))}
        </div>
        <div className="h-10 w-80 mtg-dark-skeleton rounded-xl" />
        <div className="h-64 w-full mtg-dark-skeleton rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="meetings" dir="rtl">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {[
              { label: "סה״כ החודש", value: stats.total, color: "text-white/90" },
              { label: "ממתינות", value: stats.pending, color: "text-amber-400" },
              { label: "מאושרות", value: stats.confirmed, color: "text-emerald-400" },
              { label: "הושלמו", value: stats.completed, color: "text-blue-400" },
              { label: "לא הגיעו", value: stats.noShow, color: "text-red-400" },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#162e22] backdrop-blur-sm rounded-xl border border-white/20 p-3">
                <p className="text-sm text-white/60 mb-1">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="overflow-x-auto scrollbar-hide max-w-full">
          <TabsList className="bg-white/[0.08] border border-white/20 p-1 rounded-xl">
            <TabsTrigger value="meetings" className="gap-1.5 text-white/60 data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-none data-[state=active]:text-white">
              <List className="size-4" />
              פגישות
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5 text-white/60 data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-none data-[state=active]:text-white">
              <CalendarDays className="size-4" />
              יומן פגישות
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="types" className="gap-1.5 text-white/60 data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-none data-[state=active]:text-white">
                <Layers className="size-4" />
                סוגי פגישות
                {meetingTypes.length > 0 && (
                  <span className="mr-1 inline-flex items-center justify-center rounded-full bg-white/[0.12] px-1.5 py-0.5 text-xs font-medium leading-none text-white/70">
                    {meetingTypes.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="availability" className="gap-1.5 text-white/60 data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-none data-[state=active]:text-white">
                <Clock className="size-4" />
                זמינות
              </TabsTrigger>
            )}
          </TabsList>
          </div>

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex gap-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-white/80 border-white/20"
              onClick={() => setAutomationsOpen(true)}
            >
              <Zap className="size-4" />
              אוטומציות
            </Button>
          )}
        </div>

        <TabsContent value="meetings" className="animate-fade-in-up">
          <MeetingsList meetingTypes={meetingTypes} userPlan={userPlan} />
        </TabsContent>

        <TabsContent value="calendar" className="animate-fade-in-up">
          <MeetingsCalendar meetingTypes={meetingTypes} userPlan={userPlan} />
        </TabsContent>

        {canManage && (
          <TabsContent value="types" className="animate-fade-in-up">
            <MeetingTypesList initialTypes={meetingTypes} />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="availability" className="animate-fade-in-up">
            <div className="space-y-8">
              {availability && (
                <AvailabilityEditor
                  initialData={{
                    weeklySchedule: availability.weeklySchedule as any,
                    timezone: availability.timezone,
                  }}
                  onSave={handleSaveAvailability}
                />
              )}
              <AvailabilityBlocksList
                blocks={blocks}
                onAdd={handleAddBlock}
                onDelete={handleDeleteBlock}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>

      {canManage && (
        <GlobalMeetingAutomationsModal
          open={automationsOpen}
          onClose={() => setAutomationsOpen(false)}
          meetingTypes={meetingTypes.map((t: any) => ({ id: t.id, name: t.name }))}
          userPlan={userPlan}
        />
      )}
    </>
  );
}
