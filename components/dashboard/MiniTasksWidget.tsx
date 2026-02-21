"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff, Settings2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getMiniTasksData } from "@/app/actions/dashboard-mini-widgets";

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  tags: string[];
  assignee: { name: string | null } | null;
}

interface MiniTasksWidgetProps {
  id: string;
  onRemove: () => void;
  settings?: any;
  onOpenSettings?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  todo: { label: "משימות", color: "text-slate-700", bg: "bg-slate-200" },
  in_progress: { label: "משימות בטיפול", color: "text-blue-700", bg: "bg-blue-100" },
  waiting_client: { label: "ממתינים לאישור לקוח", color: "text-amber-700", bg: "bg-amber-100" },
  on_hold: { label: "משימות בהשהייה", color: "text-gray-600", bg: "bg-gray-200" },
  completed_month: { label: "בוצעו החודש", color: "text-emerald-700", bg: "bg-emerald-100" },
  done: { label: "משימות שבוצעו", color: "text-purple-700", bg: "bg-purple-100" },
};

const PRIORITY_BADGE: Record<string, { bg: string; color: string }> = {
  high: { bg: "bg-red-100", color: "text-red-700" },
  medium: { bg: "bg-amber-100", color: "text-amber-700" },
  low: { bg: "bg-blue-50", color: "text-blue-600" },
};

const PRESET_LABELS: Record<string, string> = {
  my_active: "המשימות שלי",
  overdue: "באיחור",
  all_active: "כל הפעילות",
  due_this_week: "לשבוע",
  custom: "מותאם אישית",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};

export default function MiniTasksWidget({
  id,
  onRemove,
  settings,
  onOpenSettings,
}: MiniTasksWidgetProps) {
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
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Build filters from settings
  const filters = useMemo(() => {
    if (!settings) return undefined;
    return {
      preset: settings.preset,
      statusFilter: settings.statusFilter,
      priorityFilter: settings.priorityFilter,
      assigneeFilter: settings.assigneeFilter,
      dueDatePreset: settings.dueDatePreset,
      dueDateFrom: settings.dueDateFrom,
      dueDateTo: settings.dueDateTo,
      sortBy: settings.sortBy,
      maxTasks: settings.maxTasks,
      showCompleted: settings.showCompleted,
    };
  }, [settings]);

  const settingsKey = useMemo(
    () => JSON.stringify(filters || {}),
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    getMiniTasksData(filters)
      .then((res) => {
        if (res.success && res.data) {
          setTasks(res.data.tasks as TaskItem[]);
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

  const totalActive = Object.entries(counts)
    .reduce((sum, [, c]) => sum + c, 0);

  // Filter summary
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const preset = settings?.preset || "my_active";
    parts.push(PRESET_LABELS[preset] || "המשימות שלי");

    if (settings?.statusFilter?.length) {
      const labels = settings.statusFilter.map((s: string) => STATUS_CONFIG[s]?.label || s);
      parts.push(labels.join(", "));
    }

    if (settings?.priorityFilter?.length) {
      const labels = settings.priorityFilter.map((p: string) => PRIORITY_LABELS[p] || p);
      parts.push(labels.join(", "));
    }

    return parts.join(" · ");
  }, [settings]);

  const widgetTitle = useMemo(() => {
    const statuses = settings?.statusFilter as string[] | undefined;
    if (!statuses?.length) return "משימות פעילות";
    if (statuses.length === 1) return STATUS_CONFIG[statuses[0]]?.label || "משימות פעילות";
    return "משימות מסוננות";
  }, [settings]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-orange-100 overflow-hidden cursor-grab active:cursor-grabbing ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      <div className="h-1.5 w-full bg-linear-to-r from-orange-400 to-amber-500" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-100">
                משימות
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                {filterSummary}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{widgetTitle}</h3>
            <p className="text-sm text-gray-500">{totalActive} משימות</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onOpenSettings && (
              <button
                className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings();
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
                onRemove();
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
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <p className="text-sm">אין משימות פתוחות</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status summary bar */}
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

                {/* Task list */}
                <div className="grid grid-cols-2 gap-3">
                  {tasks.map((task) => {
                    const st = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                    const pb = task.priority ? PRIORITY_BADGE[task.priority] : null;
                    const visibleTags = task.tags?.slice(0, 3) || [];
                    const extraTags = (task.tags?.length || 0) - 3;
                    return (
                      <div
                        key={task.id}
                        className="bg-gray-50 rounded-xl p-4 space-y-2"
                      >
                        <p className="text-base font-medium text-gray-800 truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${st.bg} ${st.color}`}
                          >
                            {st.label}
                          </span>
                          {pb && (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${pb.bg} ${pb.color}`}
                            >
                              {PRIORITY_LABELS[task.priority!]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {task.dueDate && (
                            <span>
                              {new Date(task.dueDate).toLocaleDateString("he-IL", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                          {task.assignee?.name && (
                            <span className="truncate max-w-[100px]">
                              {task.assignee.name}
                            </span>
                          )}
                        </div>
                        {visibleTags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {visibleTags.map((tag, i) => (
                              <span
                                key={i}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
                              >
                                {tag}
                              </span>
                            ))}
                            {extraTags > 0 && (
                              <span className="text-[11px] text-gray-400">
                                +{extraTags}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
