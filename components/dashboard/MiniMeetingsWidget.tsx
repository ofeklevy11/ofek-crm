"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff, Settings2 } from "lucide-react";
import { useEffect, useState, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getMiniMeetingsData } from "@/app/actions/dashboard-mini-widgets";
import Link from "next/link";

interface MeetingItem {
  id: string;
  participantName: string;
  participantEmail: string | null;
  startTime: string;
  endTime: string;
  status: string;
  tags: string[];
  meetingType: { name: string; color?: string | null };
  client: { name: string } | null;
}

interface MiniMeetingsWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  settings?: any;
  onOpenSettings?: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: "ממתין", color: "text-yellow-700", bg: "bg-yellow-100" },
  CONFIRMED: { label: "מאושר", color: "text-blue-700", bg: "bg-blue-100" },
  COMPLETED: { label: "הושלם", color: "text-emerald-700", bg: "bg-emerald-100" },
  CANCELLED: { label: "בוטל", color: "text-red-700", bg: "bg-red-100" },
  NO_SHOW: { label: "לא הגיע", color: "text-gray-600", bg: "bg-gray-200" },
};

const PRESET_LABELS: Record<string, string> = {
  today: "היום",
  this_week: "השבוע",
  "7d": "7 ימים",
  "14d": "14 ימים",
  this_month: "החודש",
  custom: "מותאם אישית",
};

function MiniMeetingsWidget({
  id,
  onRemove,
  settings,
  onOpenSettings,
}: MiniMeetingsWidgetProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  const [isCollapsed, setIsCollapsed] = useState(settings?.collapsed || false);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => {
    if (!settings) return undefined;
    return {
      preset: settings.preset,
      statusFilter: settings.statusFilter,
      meetingTypeFilter: settings.meetingTypeFilter,
      dateFrom: settings.dateFrom,
      dateTo: settings.dateTo,
      sortBy: settings.sortBy,
      maxMeetings: settings.maxMeetings,
    };
  }, [settings]);

  const settingsKey = useMemo(
    () => JSON.stringify(filters || {}),
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    getMiniMeetingsData(filters)
      .then((res) => {
        if (res.success && res.data) {
          setMeetings(res.data.meetings as unknown as MeetingItem[]);
          setCounts(res.data.counts);
        }
      })
      .finally(() => setLoading(false));
  }, [settingsKey]);

  const handleToggleCollapse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    try {
      await updateDashboardWidgetSettings(id, {
        ...(settings || {}),
        collapsed: newCollapsed,
      });
      router.refresh();
    } catch {
      setIsCollapsed(!newCollapsed);
    }
  };

  const totalMeetings = Object.values(counts).reduce((sum, c) => sum + c, 0);

  const dateRangeLabel = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) =>
      d.toLocaleDateString("he-IL", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Jerusalem",
      });
    const fmtFull = (d: Date) =>
      d.toLocaleDateString("he-IL", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jerusalem",
      });
    const preset = settings?.preset || "today";

    switch (preset) {
      case "today":
        return fmtFull(now);
      case "this_week": {
        const day = now.getDay();
        const diff = day === 0 ? 0 : day;
        const start = new Date(now);
        start.setDate(now.getDate() - diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return `${fmt(start)} - ${fmt(end)}`;
      }
      case "7d": {
        const end = new Date(now.getTime() + 7 * 86400000);
        return `${fmt(now)} - ${fmt(end)}`;
      }
      case "14d": {
        const end = new Date(now.getTime() + 14 * 86400000);
        return `${fmt(now)} - ${fmt(end)}`;
      }
      case "this_month": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return `${fmt(start)} - ${fmt(end)}`;
      }
      case "custom": {
        const from = settings?.dateFrom ? new Date(settings.dateFrom) : null;
        const to = settings?.dateTo ? new Date(settings.dateTo) : null;
        if (from && to) return `${fmt(from)} - ${fmt(to)}`;
        if (from) return `מ-${fmt(from)}`;
        if (to) return `עד ${fmt(to)}`;
        return "";
      }
      default:
        return "";
    }
  }, [settings]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const preset = settings?.preset || "today";
    parts.push(PRESET_LABELS[preset] || "היום");

    if (settings?.statusFilter?.length) {
      const labels = settings.statusFilter.map((s: string) => STATUS_CONFIG[s]?.label || s);
      parts.push(labels.join(", "));
    }

    return parts.join(" · ");
  }, [settings]);

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
    });

  const uniqueMeetingTypes = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const m of meetings) {
      if (m.meetingType?.name && !map.has(m.meetingType.name)) {
        map.set(m.meetingType.name, {
          name: m.meetingType.name,
          color: m.meetingType.color || "#8B5CF6",
        });
      }
    }
    return Array.from(map.values());
  }, [meetings]);

  const isMultiDay = (settings?.preset || "today") !== "today";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-violet-100 overflow-hidden cursor-grab active:cursor-grabbing ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      <div className="h-1.5 w-full bg-linear-to-r from-violet-400 to-purple-500" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-100">
                פגישות
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                {filterSummary}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">פגישות</h3>
            {uniqueMeetingTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {uniqueMeetingTypes.map((mt) => (
                  <span
                    key={mt.name}
                    className="text-sm font-bold px-3 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: mt.color }}
                  >
                    {mt.name}
                  </span>
                ))}
              </div>
            )}
            {dateRangeLabel && (
              <p className="text-xs text-violet-500 font-medium mt-1">{dateRangeLabel}</p>
            )}
            <p className="text-sm text-gray-500">{totalMeetings} פגישות</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onOpenSettings && (
              <button
                className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-md transition"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(id);
                }}
                title="הגדרות"
              >
                <Settings2 size={16} />
              </button>
            )}
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleToggleCollapse}
              title={isCollapsed ? "הצג" : "הסתר"}
            >
              {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="הסר מהדאשבורד"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="flex-1 overflow-auto -mx-5 px-5" dir="rtl">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-2 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <p className="text-sm">אין פגישות</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status summary badges */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(STATUS_CONFIG)
                    .filter(([key]) => counts[key])
                    .map(([key, cfg]) => (
                      <span
                        key={key}
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                      >
                        {cfg.label} {counts[key]}
                      </span>
                    ))}
                </div>

                {/* Meeting cards - 2 col grid */}
                <div className="grid grid-cols-2 gap-3">
                  {meetings.map((m) => {
                    const st = STATUS_CONFIG[m.status] || STATUS_CONFIG.PENDING;
                    return (
                      <div
                        key={m.id}
                        className="bg-gray-50 rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: m.meetingType?.color || "#8B5CF6",
                            }}
                          />
                          <p className="text-base font-medium text-gray-800 truncate">
                            {m.participantName}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {m.meetingType?.name}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${st.bg} ${st.color}`}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span dir="ltr">{formatTime(m.startTime)}</span>
                          {isMultiDay && (
                            <span>{formatDate(m.startTime)}</span>
                          )}
                        </div>
                        {m.client?.name && (
                          <p className="text-xs text-gray-400 truncate">
                            {m.client.name}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Link to meetings page */}
            <Link
              href="/meetings"
              className="block text-center text-sm text-violet-600 hover:text-violet-800 mt-3 py-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              צפה בכל הפגישות
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MiniMeetingsWidget);
