"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, List } from "lucide-react";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

// Chart colors for consistency
const CHART_COLORS = [
  "#4f46e5",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

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
  leadStatus: "סטטוס ליד",
  source: "מקור",
  type: "סוג",
  lead: "ליד",
  isClosed: "נסגר",
  // Common Values translation
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
      <div className="flex flex-wrap gap-1.5 items-center mt-2">
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
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          זמן
        </span>
        <div className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
          <span className="font-medium">{text}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1 w-full mt-2">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <div className="flex flex-col gap-1">
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </div>
      )}
      {renderDateRange()}
      {config.groupByField && (
        <div className="flex items-center gap-2 mt-2">
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

interface AnalyticsWidgetProps {
  id: string; // The DND id (e.g. "analytics-123")
  view: any; // The analytics data object
  onRemove: () => void;
  onOpenDetails?: (view: any) => void;
}

export default function AnalyticsWidget({
  id,
  view,
  onRemove,
  onOpenDetails,
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

  const getAccentClass = (bgVal: string) => {
    switch (bgVal) {
      case "bg-red-50":
        return "bg-red-500";
      case "bg-yellow-50":
        return "bg-yellow-500";
      case "bg-green-50":
        return "bg-green-500";
      case "bg-blue-50":
        return "bg-blue-500";
      case "bg-purple-50":
        return "bg-purple-500";
      case "bg-pink-50":
        return "bg-pink-500";
      default:
        return "bg-gray-200";
    }
  };

  const isAutomation = view.source === "AUTOMATION";
  const isGraph = view.type === "GRAPH";
  const accentClass = getAccentClass(view.color);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex flex-col justify-between h-full bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 border border-gray-100 overflow-hidden cursor-grab active:cursor-grabbing ${
        isGraph ? "min-h-[350px]" : "min-h-[280px]"
      }`}
    >
      {/* Top Accent Line */}
      <div className={`h-1.5 w-full shrink-0 ${accentClass}`} />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAutomation
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                    : "bg-gray-50 text-gray-600 border-gray-100"
                }`}
              >
                {isAutomation ? "אוטומציה" : "אנליטיקה"}
              </span>
              {isGraph && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-pink-50 text-pink-700 border-pink-100">
                  גרף
                </span>
              )}
            </div>
            <h3
              className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight"
              title={view.ruleName}
            >
              {view.ruleName}
            </h3>
            <p className="text-xs text-gray-400 mt-1 font-medium truncate">
              {view.tableName === "System"
                ? "מערכת"
                : `מקור: ${view.tableName}`}
            </p>

            {/* ConfigDetails hidden on dashboard for cleaner layout unless needed, keeping as per original */}
          </div>

          <button
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            onPointerDown={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="הסר מהדאשבורד"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div
          className={`flex-1 w-full flex flex-col justify-center items-center my-4 ${
            view.type === "GRAPH" ? "min-h-[220px]" : "min-h-[100px]"
          }`}
        >
          {!view.stats ? (
            <div className="text-center opacity-50">
              <span className="text-4xl font-light text-gray-300">-</span>
              <p className="text-xs text-gray-400 mt-2">אין נתונים</p>
            </div>
          ) : view.type === "GRAPH" && view.data?.length > 0 ? (
            <div className="w-full" style={{ height: 250 }} dir="ltr">
              <ResponsiveContainer width="100%" height={250}>
                {view.config?.chartType === "line" ? (
                  <LineChart data={view.data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      stroke="#9ca3af"
                    />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={{ fill: "#4f46e5", r: 4 }}
                    />
                  </LineChart>
                ) : view.config?.chartType === "pie" ? (
                  <PieChart margin={{ top: 20, bottom: 20 }}>
                    <Pie
                      data={view.data}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {view.data.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      formatter={(value: any, name: string) => [
                        value.toLocaleString(),
                        name,
                      ]}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{
                        fontSize: "12px",
                        direction: "rtl",
                        right: 0,
                      }}
                    />
                  </PieChart>
                ) : (
                  <BarChart data={view.data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      stroke="#9ca3af"
                    />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip
                      cursor={{ fill: "#f9fafb" }}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      formatter={(value: any) => [
                        value.toLocaleString(),
                        view.stats.subMetric,
                      ]}
                    />
                    <Bar
                      dataKey="value"
                      fill="#4f46e5"
                      radius={[4, 4, 0, 0]}
                      barSize={32}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : view.stats.mainMetric ? (
            <div className="text-center w-full">
              <div className="text-5xl font-extrabold text-gray-900 mb-1 tracking-tight truncate px-2 leading-none">
                {view.stats.mainMetric}
              </div>
              <p className="text-sm font-medium text-gray-500">
                {view.stats.label || "ערך"}
              </p>
              {view.stats.subMetric && (
                <p
                  className="text-xs font-medium text-gray-400 mt-1 font-mono"
                  dir="rtl"
                >
                  {view.stats.subMetric}
                </p>
              )}
            </div>
          ) : view.stats.averageDuration ? (
            <div className="text-center w-full">
              <div className="text-4xl font-bold text-gray-900 mb-2 truncate">
                {view.stats.averageDuration}
              </div>
              <p className="text-sm text-gray-500">ממוצע זמן</p>
            </div>
          ) : (
            <div className="text-center opacity-50">
              <span className="text-4xl font-light text-gray-300">-</span>
              <p className="text-xs text-gray-400 mt-2">אין נתונים</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 flex justify-between items-center text-xs text-gray-400 transition-colors group-hover:bg-gray-50">
        <span className="font-medium">
          {view.stats?.totalRecords || view.data?.length || 0} רשומות
        </span>
        <div className="flex items-center gap-2">
          {/* Only show list icon for non-graph analytics */}
          {view.type !== "GRAPH" &&
            (view.data?.length > 0 || view.stats?.totalRecords > 0) &&
            onOpenDetails && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails(view);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="group/list p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-blue-600 border border-transparent hover:border-blue-100"
                title="צפה ברשימה המלאה"
              >
                <List
                  size={16}
                  className="group-hover/list:scale-110 transition-transform"
                />
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
