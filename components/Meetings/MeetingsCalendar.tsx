"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { he } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MeetingStatusBadge from "./MeetingStatusBadge";
import MeetingDetailModal from "./MeetingDetailModal";
import { toast } from "sonner";
import { Clock, User, CalendarDays } from "lucide-react";
import type { DayButton } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";

interface MeetingType {
  id: number;
  name: string;
  color?: string | null;
}

interface MeetingsCalendarProps {
  meetingTypes: MeetingType[];
  userPlan: string;
}

export default function MeetingsCalendar({ meetingTypes, userPlan }: MeetingsCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const { getMeetings } = await import("@/app/actions/meetings");
      const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

      const filters: any = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 500,
      };
      if (statusFilter !== "all") filters.status = statusFilter;
      if (typeFilter !== "all") filters.meetingTypeId = Number(typeFilter);

      const result = await getMeetings(filters);
      if (result.success && result.data) {
        setMeetings(result.data.meetings);
      }
    } catch {
      toast.error("שגיאה בטעינת פגישות");
    }
    setLoading(false);
  }, [currentMonth, statusFilter, typeFilter]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Group meetings by date key
  const meetingsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of meetings) {
      const d = new Date(m.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // Sort each day's meetings by startTime
    for (const arr of map.values()) {
      arr.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [meetings]);

  // Dates that have meetings (for modifiers)
  const datesWithMeetings = useMemo(() => {
    const dates: Date[] = [];
    for (const key of meetingsByDate.keys()) {
      const [y, m, d] = key.split("-").map(Number);
      dates.push(new Date(y, m - 1, d));
    }
    return dates;
  }, [meetingsByDate]);

  // Unique colors for dots on a given date key
  const colorsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [key, dayMeetings] of meetingsByDate) {
      const colors = new Set<string>();
      for (const m of dayMeetings) {
        colors.add(m.meetingType?.color || "#3B82F6");
        if (colors.size >= 3) break;
      }
      map.set(key, Array.from(colors));
    }
    return map;
  }, [meetingsByDate]);

  const selectedDateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const selectedDayMeetings = selectedDateKey ? meetingsByDate.get(selectedDateKey) || [] : [];

  const openDetail = async (meetingId: string) => {
    try {
      const { getMeetingById } = await import("@/app/actions/meetings");
      const result = await getMeetingById(meetingId);
      if (result.success && result.data) {
        setSelectedMeeting(result.data);
        setDetailOpen(true);
      }
    } catch {
      toast.error("שגיאה בטעינת פרטי פגישה");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const { updateMeetingStatus } = await import("@/app/actions/meetings");
    const result = await updateMeetingStatus(id, status);
    if (result.success) fetchMeetings();
    return result;
  };

  const handleUpdateNotes = async (id: string, notesBefore?: string, notesAfter?: string) => {
    const { updateMeetingNotes } = await import("@/app/actions/meetings");
    return updateMeetingNotes(id, notesBefore, notesAfter);
  };

  const handleCancel = async (id: string, reason?: string) => {
    const { cancelMeeting } = await import("@/app/actions/meetings");
    const result = await cancelMeeting(id, reason);
    if (result.success) fetchMeetings();
    return result;
  };

  const handleUpdateTags = async (id: string, tags: string[]) => {
    const { updateMeetingTags } = await import("@/app/actions/meetings");
    return updateMeetingTags(id, tags);
  };

  // Compute once outside the render callback
  const defaultClassNames = useMemo(() => getDefaultClassNames(), []);

  // Custom DayButton that renders dots
  const CustomDayButton = useCallback(
    ({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) => {
      const ref = { current: null as HTMLButtonElement | null };

      const dateKey = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
      const dots = colorsByDate.get(dateKey) || [];

      return (
        <Button
          ref={(el) => {
            ref.current = el;
            if (modifiers.focused && el) el.focus();
          }}
          variant="ghost"
          size="icon"
          data-day={day.date.toLocaleDateString()}
          data-selected-single={
            modifiers.selected &&
            !modifiers.range_start &&
            !modifiers.range_end &&
            !modifiers.range_middle
          }
          data-range-start={modifiers.range_start}
          data-range-end={modifiers.range_end}
          data-range-middle={modifiers.range_middle}
          className={cn(
            "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-0.5 leading-none text-sm font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] [&>span]:text-xs [&>span]:opacity-70",
            defaultClassNames.day,
            className
          )}
          {...props}
        >
          {props.children}
          {dots.length > 0 && (
            <span className="flex gap-1 justify-center">
              {dots.map((color, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
          )}
        </Button>
      );
    },
    [colorsByDate, defaultClassNames]
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setSelectedDate(undefined); }}>
          <SelectTrigger className="w-36 rounded-lg h-9">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="PENDING">ממתין</SelectItem>
            <SelectItem value="CONFIRMED">מאושר</SelectItem>
            <SelectItem value="COMPLETED">הושלם</SelectItem>
            <SelectItem value="CANCELLED">בוטל</SelectItem>
            <SelectItem value="NO_SHOW">לא הגיע</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setSelectedDate(undefined); }}>
          <SelectTrigger className="w-44 rounded-lg h-9">
            <SelectValue placeholder="סוג פגישה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {meetingTypes.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading && (
          <span className="text-xs text-muted-foreground">טוען...</span>
        )}
      </div>

      {/* Calendar + Day Panel */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendar */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 w-full lg:w-auto shrink-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            modifiers={{ hasMeetings: datesWithMeetings }}
            modifiersClassNames={{ hasMeetings: "" }}
            locale={he}
            dir="rtl"
            className="[--cell-size:3rem] sm:[--cell-size:3.5rem] w-full"
            classNames={{
              month_caption: "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size) text-base font-semibold",
              weekday: "text-muted-foreground rounded-md flex-1 font-medium text-sm select-none",
            }}
            components={{
              DayButton: CustomDayButton,
            }}
          />
        </div>

        {/* Day Panel */}
        <div className="flex-1 min-w-0">
          {!selectedDate ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">לחצו על יום כדי לראות את הפגישות</p>
            </div>
          ) : selectedDayMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">אין פגישות ביום זה</p>
              <p className="text-xs mt-1">
                {selectedDate.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-900">
                {selectedDate.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
                <span className="text-muted-foreground font-normal mr-2">
                  ({selectedDayMeetings.length} פגישות)
                </span>
              </h3>
              <div className="space-y-2">
                {selectedDayMeetings.map((m: any, idx: number) => {
                  const start = new Date(m.startTime);
                  const end = new Date(m.endTime);
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors duration-150 mtg-slide-up"
                      style={{ animationDelay: `${idx * 40}ms` }}
                      onClick={() => openDetail(m.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Time */}
                        <div className="text-xs text-muted-foreground shrink-0 w-24 text-left" dir="ltr">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {start.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {end.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}
                        </div>

                        {/* Participant */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {m.participantName?.charAt(0) || "?"}
                          </div>
                          <span className="text-sm font-medium truncate">{m.participantName}</span>
                        </div>

                        {/* Meeting type */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: m.meetingType?.color || "#3B82F6" }}
                          />
                          <span className="text-xs text-muted-foreground hidden sm:inline">{m.meetingType?.name}</span>
                        </div>

                        {/* Status */}
                        <div className="shrink-0">
                          <MeetingStatusBadge status={m.status} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <MeetingDetailModal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedMeeting(null); }}
        meeting={selectedMeeting}
        onUpdateStatus={handleUpdateStatus}
        onUpdateNotes={handleUpdateNotes}
        onCancel={handleCancel}
        onUpdateTags={handleUpdateTags}
        userPlan={userPlan}
      />
    </div>
  );
}
