"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, List } from "lucide-react";
import { useState } from "react";

// Available colors for the cards (matching existing app)
const COLOR_OPTIONS = [
  { label: "לבן", value: "bg-white", border: "border-gray-100" },
  { label: "אדום", value: "bg-red-50", border: "border-red-100" },
  { label: "צהוב", value: "bg-yellow-50", border: "border-yellow-100" },
  { label: "ירוק", value: "bg-green-50", border: "border-green-100" },
  { label: "כחול", value: "bg-blue-50", border: "border-blue-100" },
  { label: "סגול", value: "bg-purple-50", border: "border-purple-100" },
  { label: "ורוד", value: "bg-pink-50", border: "border-pink-100" },
];

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
  todo: "לביצוע",
  in_progress: "בטיפול",
  waiting_client: "ממתין",
  completed_month: "הושלם",
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
      <div className="flex flex-wrap gap-1 items-center bg-white/50 rounded-md px-2 py-1 border border-black/5">
        {label && <span className="text-gray-500 text-xs ml-1">{label}:</span>}
        {Object.entries(filter).map(([key, val]) => (
          <span
            key={key}
            className="text-gray-700 text-xs font-medium bg-white border border-gray-200 px-1.5 rounded"
          >
            {translate(key)}: {translate(String(val))}
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
      <div className="flex items-center gap-1 mt-1">
        <span className="text-gray-500 text-xs">זמן:</span>
        <span className="text-blue-600 text-xs font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
          {text}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 mt-2 w-full">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <>
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </>
      )}
      {renderDateRange()}
      {config.groupByField && (
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs">קבץ לפי:</span>
          <span className="text-indigo-600 text-xs font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            {translate(config.groupByField)}
          </span>
        </div>
      )}
    </div>
  );
}

interface AnalyticsWidgetProps {
  id: string; // The DND id (e.g. "analytics-123")
  view: any; // The analytics data object
  onRemove: () => void;
}

export default function AnalyticsWidget({
  id,
  view,
  onRemove,
}: AnalyticsWidgetProps) {
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

  const currentColor =
    COLOR_OPTIONS.find((c) => c.value === view.color) || COLOR_OPTIONS[0];

  const isAutomation = view.source === "AUTOMATION";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between aspect-square border ${currentColor.value} ${currentColor.border} group cursor-grab active:cursor-grabbing`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isAutomation
                  ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                  : "bg-orange-100 text-orange-700 border-orange-200"
              }`}
            >
              {isAutomation ? "אוטומציה" : "אנליטיקה"}
            </span>
          </div>
          <h3
            className="text-lg font-semibold text-gray-900 line-clamp-2"
            title={view.ruleName}
          >
            {view.ruleName}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {view.tableName === "System" ? "מערכת" : `מקור: ${view.tableName}`}
          </p>

          {!isAutomation && (
            <ConfigDetails config={view.config} type={view.type} />
          )}
        </div>
        <button
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-black/5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
          onPointerDown={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="הסר מהדאשבורד"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center my-4 cursor-grab active:cursor-grabbing">
        {!view.stats ? (
          <div className="text-center">
            <span className="text-4xl font-bold text-gray-200">-</span>
            <p className="text-sm text-gray-400 mt-2">אין מספיק נתונים</p>
          </div>
        ) : view.stats.mainMetric ? (
          <div className="text-center w-full">
            <div className="text-4xl font-bold text-blue-600 mb-2 truncate px-2">
              {view.stats.mainMetric}
            </div>
            <p className="text-sm text-gray-500">{view.stats.label || "ערך"}</p>
            {view.stats.subMetric && (
              <p className="text-xs text-gray-400 mt-1" dir="ltr">
                {view.stats.subMetric}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {view.stats.averageDuration}
            </div>
            <p className="text-sm text-gray-500">ממוצע זמן</p>
          </div>
        )}
      </div>

      <div className="border-t border-black/5 pt-4 flex justify-between items-center text-sm text-gray-500">
        <span>מבוסס על:</span>
        <div className="flex items-center gap-2">
          <span className="font-medium bg-black/5 px-2 py-1 rounded-full">
            {view.stats?.totalRecords || view.data.length} רשומות
          </span>
        </div>
      </div>
    </div>
  );
}
