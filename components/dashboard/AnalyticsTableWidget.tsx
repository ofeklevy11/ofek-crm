"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Settings, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";

interface AnalyticsTableWidgetProps {
  id: string; // The DND id
  title?: string;
  analytics: any[]; // The selected analytics with their data
  onRemove: () => void;
  onEdit: () => void;
  settings?: any;
}

export default function AnalyticsTableWidget({
  id,
  title = "טבלת אנליטיקות",
  analytics,
  onRemove,
  onEdit,
  settings,
}: AnalyticsTableWidgetProps) {
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
    } catch (err) {
      console.error("Failed to update collapsed state", err);
      setIsCollapsed(!newCollapsed);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-indigo-100 overflow-hidden cursor-grab active:cursor-grabbing ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      {/* Top Accent - Blue/Purple Gradient */}
      <div className="h-1.5 w-full bg-linear-to-r from-blue-500 to-purple-500" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                אנליטיקות
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{analytics.length} אייטמים</p>
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
                onEdit();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
              title="ערוך"
            >
              <Settings className="w-4 h-4" />
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-sm text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">שם האנליטיקה</th>
                  <th className="pb-3 font-medium w-32">מקור</th>
                  <th className="pb-3 font-medium text-center">ערך</th>
                  <th className="pb-3 font-medium text-center">תווית</th>
                  <th className="pb-3 font-medium text-center">רשומות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {analytics.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      לא נבחרו אנליטיקות להצגה
                    </td>
                  </tr>
                ) : (
                  analytics.map((view) => {
                    const stats = view.stats || {};
                    let valueDisplay = null;
                    let labelDisplay = stats.label || null;

                    if (
                      stats.mainMetric !== undefined &&
                      stats.mainMetric !== null
                    ) {
                      valueDisplay = stats.mainMetric;
                    } else if (stats.averageDuration) {
                      valueDisplay = stats.averageDuration;
                      labelDisplay = "ממוצע זמן";
                    }

                    const hasData = valueDisplay !== null;

                    return (
                      <tr
                        key={view.id}
                        className="group/row hover:bg-gray-50/50 transition-colors"
                      >
                        <td
                          className="py-4 font-semibold text-gray-900 group-hover/row:text-blue-600 transition-colors max-w-[200px] truncate"
                          title={view.ruleName}
                        >
                          {view.ruleName}
                        </td>
                        <td className="py-4 text-gray-500 text-xs">
                          <span className="bg-gray-50 border border-gray-100 px-2 py-1 rounded text-gray-600">
                            {view.tableName === "System"
                              ? "מערכת"
                              : view.tableName}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          {hasData ? (
                            <span
                              className="font-bold text-gray-900 text-lg"
                              dir="ltr"
                            >
                              {valueDisplay}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="py-4 text-center text-gray-500 text-xs">
                          {labelDisplay || "-"}
                        </td>
                        <td className="py-4 text-center">
                          {stats.totalRecords !== undefined ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600">
                              {stats.totalRecords}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
