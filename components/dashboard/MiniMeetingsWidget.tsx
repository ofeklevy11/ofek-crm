"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import Link from "next/link";

interface MeetingItem {
  id: string;
  participantName: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingType: { name: string; color?: string | null };
}

interface MiniMeetingsWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  settings?: any;
}

function MiniMeetingsWidget({
  id,
  onRemove,
  settings,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    import("@/app/actions/meetings")
      .then(({ getTodaysMeetings }) => getTodaysMeetings())
      .then((res) => {
        if (res.success && res.data) {
          setMeetings(res.data as unknown as MeetingItem[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

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
    new Date(d).toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
    });

  const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-400",
    CONFIRMED: "bg-blue-400",
    COMPLETED: "bg-green-400",
    CANCELLED: "bg-red-400",
    NO_SHOW: "bg-gray-400",
  };

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
      <div className="h-1.5 w-full bg-gradient-to-r from-violet-400 to-purple-500" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-100">
                פגישות
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                היום
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">פגישות היום</h3>
            <p className="text-sm text-gray-500">{meetings.length} פגישות</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                <p className="text-sm">אין פגישות היום</p>
              </div>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className="bg-gray-50 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: m.meetingType?.color || "#8B5CF6",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {m.participantName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.meetingType?.name}
                      </p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-medium text-gray-700" dir="ltr">
                        {formatTime(m.startTime)}
                      </p>
                      <div
                        className={`w-1.5 h-1.5 rounded-full mx-auto mt-1 ${
                          STATUS_COLORS[m.status] || "bg-gray-400"
                        }`}
                      />
                    </div>
                  </div>
                ))}
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
