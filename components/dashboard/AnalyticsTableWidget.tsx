"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Settings, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, memo } from "react";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";

const KEY_MAPPING: Record<string, string> = {
  status: "סטטוס",
  priority: "עדיפות",
  assignee: "נציג מטפל",
  tags: "תגיות",
  amount: "סכום",
  title: "כותרת",
  description: "תיאור",
  client: "לקוח",
  phone: "טלפון",
  email: "מייל",
  relatedType: "סוג קשור",
  frequency: "תדירות",
  startDate: "תאריך התחלה",
  dueDate: "תאריך יעד",
  createdAt: "נוצר ב",
  updatedAt: "עודכן ב",
  leadStatus: "סטטוס ליד",
  source: "מקור",
  type: "סוג",
  lead: "ליד",
  isClosed: "נסגר",
  // Common Values translation
  todo: "משימות",
  in_progress: "משימות בטיפול",
  waiting_client: "ממתינים לאישור לקוח",
  on_hold: "משימות בהשהייה",
  completed_month: "בוצעו החודש",
  done: "משימות שבוצעו",
  archive: "ארכיון",
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  active: "פעיל",
  paused: "מושהה",
  cancelled: "מבוטל",
  paid: "שולם",
  pending: "ממתין",
  overdue: "באיחור",
  completed: "הושלם",
  failed: "נכשל",
  this_week: "השבוע (א'-ש')",
  last_30_days: "30 ימים אחרונים",
  last_year: "שנה אחרונה",
};

const translate = (key: string) => KEY_MAPPING[key] || key;

function ConfigDetails({ config, type }: { config: any; type: string }) {
  if (!config) return null;

  const renderFilter = (filter: any, label?: string) => {
    if (!filter || Object.keys(filter).length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 items-center mt-1">
        {label && (
          <span className="text-gray-400 text-[10px] font-medium uppercase tracking-wider ml-1">
            {label}
          </span>
        )}
        {Object.entries(filter).map(([key, val]) => (
          <span
            key={key}
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-100"
          >
            <span className="opacity-60 ml-1">{translate(key)}:</span>
            <span>{translate(String(val))}</span>
          </span>
        ))}
      </div>
    );
  };

  const renderDateRange = () => {
    if (!config.dateRangeType || config.dateRangeType === "all") return null;
    let text = translate(config.dateRangeType);
    if (config.dateRangeType === "custom") {
      const start = config.customStartDate
        ? new Date(config.customStartDate).toLocaleDateString("he-IL")
        : "";
      const end = config.customEndDate
        ? new Date(config.customEndDate).toLocaleDateString("he-IL")
        : "";
      text = `${start} - ${end}`;
    }
    return (
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          זמן
        </span>
        <div className="flex items-center gap-1.5 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
          <span className="font-medium">{text}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 w-full mt-1">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <div className="flex flex-col gap-1">
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </div>
      )}
      {renderDateRange()}
      {config.groupByField && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            קבץ לפי
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
            {translate(config.groupByField)}
          </span>
        </div>
      )}
    </div>
  );
}

const getSourceColor = (source: string) => {
  const colors = [
    { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100" },
    {
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-100",
    },
    { bg: "bg-green-50", text: "text-green-700", border: "border-green-100" },
    { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
    { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100" },
    {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      border: "border-indigo-100",
    },
    { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-100" },
    { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-100" },
    {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-100",
    },
    {
      bg: "bg-fuchsia-50",
      text: "text-fuchsia-700",
      border: "border-fuchsia-100",
    },
  ];

  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

interface AnalyticsTableWidgetProps {
  id: string; // The DND id
  title?: string;
  analytics: any[]; // The selected analytics with their data
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  settings?: any;
}

function AnalyticsTableWidget({
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
                onEdit(id);
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-sm text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">שם האנליטיקה</th>
                  <th className="pb-3 font-medium w-32">מקור</th>
                  <th className="pb-3 font-medium text-center">ערך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {analytics.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-400">
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
                    const sourceName =
                      view.tableName === "System" ? "מערכת" : view.tableName;
                    const sourceColor = getSourceColor(sourceName);

                    return (
                      <tr
                        key={view.id}
                        className="group/row hover:bg-gray-50/50 transition-colors"
                      >
                        <td
                          className="py-4 font-semibold text-gray-900 group-hover/row:text-blue-600 transition-colors max-w-[200px] truncate"
                          title={view.ruleName}
                        >
                          <div>{view.ruleName}</div>
                          <ConfigDetails
                            config={view.config}
                            type={view.type}
                          />
                        </td>
                        <td className="py-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${sourceColor.bg} ${sourceColor.text} ${sourceColor.border}`}
                          >
                            {sourceName}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          {hasData ? (
                            <div className="flex justify-center">
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm shadow-sm">
                                <span className="text-gray-500 text-xs font-medium">
                                  סה״כ:
                                </span>
                                <span className="font-bold text-gray-900 dir-ltr">
                                  {valueDisplay}
                                </span>
                              </div>
                            </div>
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

export default memo(AnalyticsTableWidget);
