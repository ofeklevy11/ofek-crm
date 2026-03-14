"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff, Settings2, GripVertical } from "lucide-react";
import { useEffect, useState, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getMiniCalendarData } from "@/app/actions/dashboard-mini-widgets";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  color: string | null;
  source?: "crm" | "google";
}

interface MiniCalendarWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  settings?: any;
  onOpenSettings?: (id: string) => void;
}

const PRESET_LABELS: Record<string, string> = {
  today: "היום",
  this_week: "השבוע",
  "7d": "7 ימים הקרובים",
  "14d": "14 ימים הקרובים",
  this_month: "החודש",
  custom: "טווח מותאם",
};

const SOURCE_LABELS: Record<string, string> = {
  crm: "יומן מערכת",
  google: "Google Calendar",
  all: "כל היומנים",
};

function MiniCalendarWidget({
  id,
  onRemove,
  settings,
  onOpenSettings,
}: MiniCalendarWidgetProps) {
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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(true);

  // Build filters from settings
  const filters = useMemo(() => {
    if (!settings) return undefined;
    return {
      preset: settings.preset,
      customFrom: settings.customFrom,
      customTo: settings.customTo,
      maxEvents: settings.maxEvents,
      calendarSource: settings.calendarSource,
    };
  }, [settings]);

  // Stable key for settings to detect changes
  const settingsKey = useMemo(
    () => JSON.stringify(filters || {}),
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    getMiniCalendarData(filters)
      .then((res) => {
        if (res.success && res.data) setEvents(res.data as unknown as CalendarEvent[]);
        if ("googleConnected" in res) setGoogleConnected(res.googleConnected as boolean);
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

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  // Filter summary
  const filterSummary = useMemo(() => {
    const preset = settings?.preset || "14d";
    if (preset === "custom" && settings?.customFrom) {
      const from = new Date(settings.customFrom).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
      const to = settings.customTo
        ? new Date(settings.customTo).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })
        : "...";
      return `${from}–${to}`;
    }
    return PRESET_LABELS[preset] || "14 ימים הקרובים";
  }, [settings]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-cyan-100 overflow-hidden ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      <div className="h-1.5 w-full bg-linear-to-r from-cyan-400 to-blue-500" aria-hidden="true" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start gap-1">
            <button
              {...attributes}
              {...listeners}
              className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 rounded touch-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
              aria-label="גרור ווידג׳ט: אירועים קרובים"
              aria-roledescription="פריט ניתן לגרירה"
            >
              <GripVertical size={16} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-cyan-50 text-cyan-700 border-cyan-100">
                {SOURCE_LABELS[settings?.calendarSource || "crm"] || "יומן מערכת"}
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600 border border-cyan-100">
                {filterSummary}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">אירועים קרובים</h3>
            <p className="text-sm text-gray-500">{events.length} אירועים</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {onOpenSettings && (
              <button
                className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                {!googleConnected && settings?.calendarSource && settings.calendarSource !== "crm" ? (
                  <p className="text-sm">Google Calendar לא מחובר</p>
                ) : (
                  <p className="text-sm">אין אירועים קרובים</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-gray-50 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ev.source === "google" ? "#1a73e8" : (ev.color || "#06b6d4") }}
                        aria-hidden="true"
                      />
                      <p className="text-base font-medium text-gray-800 truncate">
                        {ev.title}
                      </p>
                    </div>
                    {ev.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-1">
                        {ev.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span dir="ltr">
                        {formatTime(ev.startTime)}–{formatTime(ev.endTime)}
                      </span>
                      <span>
                        {new Date(ev.startTime).toLocaleDateString("he-IL", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MiniCalendarWidget);
