"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  X,
  Settings,
  Eye,
  EyeOff,
  LayoutGrid,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getTableViewData } from "@/app/actions/dashboard";

// Icon colors matching the design from the image
const VIEW_COLORS = [
  { bg: "bg-blue-100", icon: "text-blue-500", border: "border-blue-200" },
  { bg: "bg-green-100", icon: "text-green-500", border: "border-green-200" },
  { bg: "bg-purple-100", icon: "text-purple-500", border: "border-purple-200" },
  { bg: "bg-pink-100", icon: "text-pink-500", border: "border-pink-200" },
  { bg: "bg-orange-100", icon: "text-orange-500", border: "border-orange-200" },
  { bg: "bg-cyan-100", icon: "text-cyan-500", border: "border-cyan-200" },
  { bg: "bg-yellow-100", icon: "text-yellow-600", border: "border-yellow-200" },
  { bg: "bg-red-100", icon: "text-red-500", border: "border-red-200" },
  { bg: "bg-indigo-100", icon: "text-indigo-500", border: "border-indigo-200" },
  { bg: "bg-teal-100", icon: "text-teal-500", border: "border-teal-200" },
];

interface ViewItem {
  tableId: number;
  viewId: number;
  tableName?: string;
  viewName?: string;
  colorIndex?: number;
}

interface TableViewsDashboardWidgetProps {
  id: string;
  title?: string;
  views: ViewItem[];
  availableTables: any[];
  onRemove: (id: string) => void;
  onEdit?: (id: string) => void;
  settings?: any;
  onSettingsChange?: (id: string, newSettings: any) => void;
}

interface ViewData {
  count: number;
  label: string;
  isLoading: boolean;
  error?: string;
}

function TableViewsDashboardWidget({
  id,
  title = "מיני דאשבורד",
  views,
  availableTables,
  onRemove,
  onEdit,
  settings,
  onSettingsChange,
}: TableViewsDashboardWidgetProps) {
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
  const [viewsData, setViewsData] = useState<Record<string, ViewData>>({});

  // Fetch data for each view
  useEffect(() => {
    if (isCollapsed) return;

    let cancelled = false;

    // Mark all views as loading
    const initialState: Record<string, ViewData> = {};
    for (const view of views) {
      const key = `${view.tableId}-${view.viewId}`;
      initialState[key] = { count: 0, label: view.viewName || "טוען...", isLoading: true };
    }
    setViewsData(initialState);

    const fetchAll = async () => {
      const results = await Promise.allSettled(
        views.map(async (view) => {
          const key = `${view.tableId}-${view.viewId}`;
          const res = await getTableViewData(view.tableId, view.viewId);
          return { key, view, res };
        }),
      );

      if (cancelled) return;

      setViewsData((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (result.status === "fulfilled") {
            const { key, view, res } = result.value;
            if (res.success && res.data) {
              const data = res.data.data;
              let count = 0;

              if (data?.result !== undefined) {
                count = data.result;
              } else if (data?.count !== undefined) {
                count = data.count;
              } else if (data?.groups) {
                count = data.groups.reduce(
                  (sum: number, g: any) => sum + (g.count || 0),
                  0,
                );
              } else if (data?.totalCount !== undefined) {
                count = data.totalCount;
              }

              const table = availableTables.find((t) => t.id === view.tableId);
              const viewInfo = table?.views?.find((v: any) => v.id === view.viewId);
              const viewName = viewInfo?.name || view.viewName || "תצוגה";

              next[key] = { count, label: viewName, isLoading: false };
            } else {
              next[key] = {
                count: 0,
                label: view.viewName || "שגיאה",
                isLoading: false,
                error: res.error,
              };
            }
          } else {
            // rejected
            const view = views[results.indexOf(result)];
            const key = `${view.tableId}-${view.viewId}`;
            next[key] = {
              count: 0,
              label: view.viewName || "שגיאה",
              isLoading: false,
              error: "Failed to load",
            };
          }
        }
        return next;
      });
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [views, isCollapsed, availableTables]);

  const handleToggleCollapse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);

    try {
      const newSettings = {
        ...(settings || {}),
        collapsed: newCollapsed,
      };

      await updateDashboardWidgetSettings(id, newSettings);

      if (onSettingsChange) {
        onSettingsChange(id, newSettings);
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to update collapsed state", err);
      setIsCollapsed(!newCollapsed);
    }
  };

  const getColorForIndex = (index: number) => {
    return VIEW_COLORS[index % VIEW_COLORS.length];
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 border border-gray-100 overflow-hidden ${
        isCollapsed ? "h-auto" : "min-h-[200px]"
      }`}
    >
      {/* Top Accent Line - Gradient */}
      <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#4f95ff] to-[#a24ec1]" aria-hidden="true" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start gap-1">
            <button
              {...attributes}
              {...listeners}
              className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 rounded touch-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
              aria-label={`גרור ווידג׳ט: ${title}`}
              aria-roledescription="פריט ניתן לגרירה"
            >
              <GripVertical size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-gradient-to-r from-blue-50 to-purple-50 text-purple-700 border-purple-100">
                מיני דאשבורד
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-100">
                {views.length} תצוגות
              </span>
            </div>
            <h3
              className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight"
              title={title}
            >
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={handleToggleCollapse}
              title={isCollapsed ? "הצג" : "הסתר"}
              aria-label={isCollapsed ? "הצג תוכן ווידג׳ט" : "הסתר תוכן ווידג׳ט"}
            >
              {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            {onEdit && (
              <button
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(id);
                }}
                title="עריכה"
                aria-label="הגדרות ווידג׳ט"
              >
                <Settings size={16} />
              </button>
            )}

            <button
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={() => onRemove(id)}
              title="הסר מהדאשבורד"
              aria-label="הסר ווידג׳ט מהדאשבורד"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Views Grid */}
        {!isCollapsed && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
            {views.map((view, index) => {
              const key = `${view.tableId}-${view.viewId}`;
              const data = viewsData[key];
              const colors = getColorForIndex(view.colorIndex ?? index);
              const table = availableTables.find((t) => t.id === view.tableId);

              return (
                <div
                  key={key}
                  className="relative bg-white rounded-xl border border-gray-100 p-4 transition-all group/card"
                >
                  {/* Number */}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {data?.isLoading ? (
                        <span className="inline-block w-8 h-6 bg-gray-100 animate-pulse rounded" role="status">
                          <span className="sr-only">טוען...</span>
                        </span>
                      ) : (
                        (data?.count?.toLocaleString() ?? 0)
                      )}
                    </span>

                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center`}
                    >
                      <LayoutGrid size={14} className={colors.icon} />
                    </div>
                  </div>

                  {/* Label */}
                  <p
                    className="text-sm text-gray-600 font-medium line-clamp-2"
                    title={data?.label || view.viewName}
                  >
                    {data?.label || view.viewName || "תצוגה"}
                  </p>

                  {/* Table name hint */}
                  <p className="text-[11px] text-gray-400 mt-1 truncate">
                    {table?.name || ""}
                  </p>
                </div>
              );
            })}

            {/* Empty state if no views */}
            {views.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <LayoutGrid size={20} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">
                  אין תצוגות במיני הדאשבורד
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  לחץ על עריכה כדי להוסיף תצוגות
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isCollapsed && views.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 flex justify-between items-center text-xs text-gray-400 transition-colors group-hover:bg-gray-50">
          <span className="font-medium">
            {views.length} תצוגות מ-{new Set(views.map((v) => v.tableId)).size}{" "}
            טבלאות
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(TableViewsDashboardWidget);
