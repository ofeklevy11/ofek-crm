"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import MeetingsList from "@/components/Meetings/MeetingsList";
import MeetingTypesList from "@/components/Meetings/MeetingTypesList";
import AvailabilityEditor from "@/components/Meetings/AvailabilityEditor";
import AvailabilityBlocksList from "@/components/Meetings/AvailabilityBlocksList";
import GlobalMeetingAutomationsModal from "@/components/Meetings/GlobalMeetingAutomationsModal";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Layers, Clock, Zap } from "lucide-react";

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
  const [stats, setStats] = useState<{ total: number; pending: number; confirmed: number; completed: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [
          { getMeetingTypes },
          { getCompanyAvailability, getAvailabilityBlocks },
        ] = await Promise.all([
          import("@/app/actions/meetings"),
          import("@/app/actions/availability"),
        ]);

        const [typesRes, availRes, blocksRes] = await Promise.all([
          getMeetingTypes(),
          getCompanyAvailability(),
          getAvailabilityBlocks(),
        ]);

        if (typesRes.success) setMeetingTypes(typesRes.data || []);
        if (availRes.success) setAvailability(availRes.data);
        if (blocksRes.success) setBlocks(blocksRes.data || []);

        try {
          const { getMeetingStats } = await import("@/app/actions/meetings");
          const statsRes = await getMeetingStats("month");
          if (statsRes.success && statsRes.data) {
            const d = statsRes.data;
            setStats({
              total: d.total,
              pending: d.byStatus?.["PENDING"] || 0,
              confirmed: d.byStatus?.["CONFIRMED"] || 0,
              completed: d.byStatus?.["COMPLETED"] || 0,
            });
          }
        } catch { /* getMeetingStats may not exist yet */ }
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-3 space-y-2">
              <div className="h-3 w-16 mtg-skeleton-shimmer" />
              <div className="h-7 w-12 mtg-skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="h-10 w-80 mtg-skeleton-shimmer rounded-xl" />
        <div className="h-64 w-full mtg-skeleton-shimmer rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="meetings" dir="rtl">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "סה״כ החודש", value: stats.total, color: "text-gray-900" },
              { label: "ממתינות", value: stats.pending, color: "text-amber-600" },
              { label: "מאושרות", value: stats.confirmed, color: "text-emerald-600" },
              { label: "הושלמו", value: stats.completed, color: "text-blue-600" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <TabsList className="bg-gray-100/80 p-1 rounded-xl">
            <TabsTrigger value="meetings" className="gap-1.5 text-gray-500 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900">
              <CalendarDays className="size-4" />
              פגישות
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="types" className="gap-1.5 text-gray-500 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900">
                <Layers className="size-4" />
                סוגי פגישות
                {meetingTypes.length > 0 && (
                  <span className="mr-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none">
                    {meetingTypes.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="availability" className="gap-1.5 text-gray-500 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900">
                <Clock className="size-4" />
                זמינות
              </TabsTrigger>
            )}
          </TabsList>

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
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
