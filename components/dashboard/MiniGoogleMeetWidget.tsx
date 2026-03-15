"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff, Settings2, GripVertical, Video, Users, ExternalLink, Repeat, LinkIcon } from "lucide-react";
import { useEffect, useState, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getMiniGoogleMeetData } from "@/app/actions/dashboard-mini-widgets";
import type { GoogleMeetEvent } from "@/lib/types";
import Link from "next/link";

interface MiniGoogleMeetWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  settings?: any;
  onOpenSettings?: (id: string) => void;
}

const PRESET_LABELS: Record<string, string> = {
  today: "היום",
  this_week: "השבוע",
  "7d": "7 ימים",
  "14d": "14 ימים",
  this_month: "החודש",
  custom: "מותאם אישית",
};

function MiniGoogleMeetWidget({
  id,
  onRemove,
  settings,
  onOpenSettings,
}: MiniGoogleMeetWidgetProps) {
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
  const [meetings, setMeetings] = useState<GoogleMeetEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => {
    if (!settings) return undefined;
    return {
      preset: settings.preset,
      dateFrom: settings.dateFrom,
      dateTo: settings.dateTo,
      maxMeetings: settings.maxMeetings,
    };
  }, [settings]);

  const settingsKey = useMemo(
    () => JSON.stringify(filters || {}),
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    getMiniGoogleMeetData(filters)
      .then((res) => {
        if (res.success && res.data) {
          const parsed = res.data.meetings.map((m) => ({
            ...m,
            startTime: new Date(m.startTime),
            endTime: new Date(m.endTime),
          }));
          setMeetings(parsed);
          setTotalCount(res.data.totalCount);
        }
        setConnected(res.connected ?? null);
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
    const preset = settings?.preset || "this_week";

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
    const preset = settings?.preset || "this_week";
    return PRESET_LABELS[preset] || "השבוע";
  }, [settings]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = (d: Date) =>
    d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
    });

  const isMultiDay = (settings?.preset || "this_week") !== "today";

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/integrations/google/calendar/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }
    } catch {
      // Handled silently
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-blue-100 overflow-hidden ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      <div className="h-1.5 w-full bg-linear-to-r from-blue-400 to-teal-500" aria-hidden="true" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start gap-1">
            <button
              {...attributes}
              {...listeners}
              className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 rounded touch-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
              aria-label="גרור ווידג׳ט: Google Meet"
              aria-roledescription="פריט ניתן לגרירה"
            >
              <GripVertical size={16} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                Google Meet
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                {filterSummary}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Video size={18} className="text-blue-500" aria-hidden="true" />
              פגישות Google Meet
            </h3>
            {dateRangeLabel && (
              <p className="text-xs text-blue-500 font-medium mt-1">{dateRangeLabel}</p>
            )}
            <p className="text-sm text-gray-500">{totalCount} פגישות</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {onOpenSettings && (
              <button
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(id);
                }}
                title="הגדרות"
                aria-label="הגדרות ווידג׳ט"
              >
                <Settings2 size={16} />
              </button>
            )}
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={handleToggleCollapse}
              title={isCollapsed ? "הצג" : "הסתר"}
              aria-label={isCollapsed ? "הצג תוכן ווידג׳ט" : "הסתר תוכן ווידג׳ט"}
            >
              {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              title="הסר מהדאשבורד"
              aria-label="הסר ווידג׳ט מהדאשבורד"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="flex-1 overflow-auto -mx-5 px-5" dir="rtl">
            {loading ? (
              <div className="space-y-3" role="status">
                <span className="sr-only">טוען נתונים...</span>
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
            ) : connected === false ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <LinkIcon size={24} className="mb-2 text-gray-300" />
                <p className="text-sm mb-2">Google Calendar לא מחובר</p>
                <button
                  onClick={handleConnect}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  חבר את Google Calendar
                </button>
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Video size={24} className="mb-2 text-gray-300" />
                <p className="text-sm">אין פגישות Google Meet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Meeting cards - 2 col grid */}
                <div className="grid grid-cols-2 gap-3">
                  {meetings.map((m) => (
                    <div
                      key={m.id}
                      className="bg-gray-50 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Video
                          size={10}
                          className="shrink-0 text-blue-500"
                          aria-hidden="true"
                        />
                        <p className="text-base font-medium text-gray-800 truncate">
                          {m.title}
                        </p>
                      </div>
                      {m.isRecurring && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <Repeat size={10} aria-hidden="true" />
                          חוזר
                        </span>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span dir="ltr">{formatTime(m.startTime)}</span>
                        {isMultiDay && (
                          <span>{formatDate(m.startTime)}</span>
                        )}
                      </div>
                      {m.attendees.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Users size={10} aria-hidden="true" />
                          <span>{m.attendees.length} משתתפים</span>
                        </div>
                      )}
                      {m.meetLink && (
                        <a
                          href={m.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                          aria-label="הצטרף לפגישת Google Meet"
                        >
                          <ExternalLink size={10} aria-hidden="true" />
                          הצטרף ל-Meet
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link to meetings page */}
            <Link
              href="/meetings"
              className="block text-center text-sm text-blue-600 hover:text-blue-800 mt-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              צפה בכל פגישות Google Meet
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MiniGoogleMeetWidget);
