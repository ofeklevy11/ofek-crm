"use client";

import Link from "next/link";
import { ProcessedViewData } from "@/lib/viewProcessor";

interface DynamicViewRendererProps {
  viewData: ProcessedViewData;
}

export default function DynamicViewRenderer({
  viewData,
}: DynamicViewRendererProps) {
  const { type, title, data } = viewData;

  switch (type) {
    case "stats":
      return <StatsView title={title} data={data} />;
    case "aggregation":
      return <AggregationView title={title} data={data} />;
    case "legend":
      return <LegendView title={title} data={data} />;
    case "chart":
      return <ChartView title={title} data={data} />;
    case "custom-table":
      return <CustomTableView title={title} data={data} />;
    default:
      return (
        <div className="text-sm text-gray-500">Unknown view type: {type}</div>
      );
  }
}

function CustomTableView({ title, data }: { title: string; data: any }) {
  const { columns, records, hasMore, tableSlug, tableId } = data;

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
        <div className="text-4xl mb-2">📭</div>
        <div className="text-sm">אין נתונים להצגה</div>
      </div>
    );
  }

  // Helper function to get contrasting text color
  const getContrastColor = (bgColor: string): string => {
    if (!bgColor) return "#000000";
    const hex = bgColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#000000" : "#FFFFFF";
  };

  // Render cell value with proper formatting for select fields
  const renderCellValue = (col: any, val: any) => {
    if (val === null || val === undefined || val === "") {
      return <span className="text-gray-300">-</span>;
    }

    // Handle select/radio fields - always show as badges
    if (col.type === "select" || col.type === "radio") {
      const selectColor = col.optionColors?.[val];
      if (selectColor) {
        return (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-center whitespace-normal h-auto leading-tight"
            style={{
              backgroundColor: selectColor,
              color: "#FFFFFF",
            }}
          >
            {val}
          </span>
        );
      }
      // No color defined - default display with gray badge
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 text-center whitespace-normal h-auto leading-tight">
          {val}
        </span>
      );
    }

    // Handle tags/multi-select fields - always show as badges
    if (col.type === "tags" || col.type === "multi-select") {
      let displayVal = val;
      if (typeof val === "string" && val.startsWith("[")) {
        try {
          displayVal = JSON.parse(val);
        } catch (e) {
          // ignore parsing error
        }
      }
      if (Array.isArray(displayVal)) {
        return (
          <div className="flex flex-wrap gap-1">
            {displayVal.map((v: string, i: number) => {
              const itemColor = col.optionColors?.[v];
              if (itemColor) {
                return (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: itemColor,
                      color: "#FFFFFF",
                    }}
                  >
                    {v}
                  </span>
                );
              }
              return (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700"
                >
                  {v}
                </span>
              );
            })}
          </div>
        );
      }
      // If it's not an array, still show as a badge
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 text-center whitespace-normal h-auto leading-tight">
          {String(val)}
        </span>
      );
    }

    // Date formatting
    if (col.name === "createdAt" || col.name === "updatedAt") {
      if (val) return new Date(val).toLocaleString("he-IL");
    }

    // Handle objects/arrays
    if (typeof val === "object" && val !== null && !(val instanceof Date)) {
      return Array.isArray(val) ? val.join(", ") : JSON.stringify(val);
    }

    // Handle booleans
    if (val === true) return "כן";
    if (val === false) return "לא";

    return val;
  };

  return (
    <div className="w-full h-full flex flex-col font-sans">
      {/* Removed title from here as it is displayed by the widget container */}
      <div className="flex-1 overflow-auto -mx-4 px-4 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        <table className="w-full text-sm text-right border-collapse">
          <thead className="sticky top-0 bg-white z-10 text-xs text-gray-500 font-semibold uppercase tracking-wider pb-2 border-b border-gray-100">
            <tr>
              {columns.map((col: any) => (
                <th
                  key={col.name}
                  className="py-2 px-2 first:pr-0 font-medium text-gray-400"
                >
                  {col.label || col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((record: any) => (
              <tr
                key={record.id}
                className="group hover:bg-blue-50/50 transition-colors"
              >
                {columns.map((col: any) => {
                  let val = record.data?.[col.name];

                  // Handle system fields
                  if (col.name === "createdAt") val = record.createdAt;
                  if (col.name === "updatedAt") val = record.updatedAt;
                  if (col.name === "createdBy") val = record.createdBy;
                  if (col.name === "updatedBy") val = record.updatedBy;

                  return (
                    <td
                      key={col.name}
                      className="py-2.5 px-2 first:pr-0 text-gray-700 min-w-[120px] max-w-[300px]"
                    >
                      {renderCellValue(col, val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-auto pt-3 border-t border-gray-100/50 flex justify-center">
          <a
            href={`/tables/${tableId}`}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium cursor-pointer transition-colors px-3 py-1 bg-blue-50/50 hover:bg-blue-50 rounded-full"
          >
            הצג עוד רשומות...
          </a>
        </div>
      )}
    </div>
  );
}

function StatsView({ title, data }: { title: string; data: any }) {
  const timeRangeLabels = {
    week: "השבוע",
    month: "החודש",
    all: "כל הזמנים",
  };

  const colors = {
    week: {
      bg: "bg-gradient-to-br from-blue-50 to-blue-100",
      text: "text-blue-700",
      border: "border-blue-200",
    },
    month: {
      bg: "bg-gradient-to-br from-purple-50 to-purple-100",
      text: "text-purple-700",
      border: "border-purple-200",
    },
    all: {
      bg: "bg-gradient-to-br from-gray-50 to-gray-100",
      text: "text-gray-700",
      border: "border-gray-200",
    },
  };

  const color = colors[data.timeRange as keyof typeof colors] || colors.all;

  return (
    <div className="space-y-3 w-full">
      <div
        className={`${color.bg} border ${color.border} p-6 rounded-2xl text-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}
      >
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/30 rounded-full blur-2xl -ml-10 -mb-10" />

        <div
          className={`text-4xl font-extrabold ${color.text} mb-1 relative z-10`}
        >
          {data.count.toLocaleString()}
          {data.isOverLimit && <span className="text-2xl align-top">+</span>}
        </div>
        <div
          className={`text-sm ${color.text} font-medium opacity-80 relative z-10`}
        >
          {timeRangeLabels[data.timeRange as keyof typeof timeRangeLabels] ||
            "ספירה"}
        </div>
      </div>
      {data.isOverLimit && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-800 flex items-start gap-2">
          <span className="text-lg">📊</span>
          <div>
            <div className="font-bold">מעל 1,000 רשומות</div>
            <div className="opacity-80">
              לצפייה במלוא הנתונים, יש לשדרג חבילה.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AggregationView({ title, data }: { title: string; data: any }) {
  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-red-50 rounded-2xl border border-red-100 text-center">
        <div className="text-red-500 mb-2">⚠️</div>
        <div className="text-sm text-red-600 font-medium">{data.error}</div>
      </div>
    );
  }

  // Group-by aggregation
  if (data.groups) {
    return (
      <div className="w-full space-y-3 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        {data.groups.map((group: any, index: number) => {
          const defaultColors = [
            "bg-blue-500",
            "bg-purple-500",
            "bg-emerald-500",
            "bg-orange-500",
            "bg-pink-500",
            "bg-indigo-500",
            "bg-cyan-500",
            "bg-rose-500",
          ];

          const barColor =
            data.colorMapping?.[group.label] ||
            defaultColors[index % defaultColors.length];

          const textColor = barColor.replace("bg-", "text-");

          return (
            <div key={group.label} className="group">
              <div className="flex justify-between items-end text-sm mb-1.5">
                <span className="text-gray-700 font-medium truncate max-w-[60%]">
                  {group.label || "ללא"}
                </span>
                <span className="font-bold text-gray-900 bg-gray-50 px-1.5 py-0.5 rounded text-xs">
                  {data.aggregationType === "sum" && data.targetField
                    ? `₪${Math.round(group.sum).toLocaleString()}`
                    : group.count}
                  <span className="text-gray-400 font-normal mx-1">|</span>
                  <span className="text-gray-500">
                    {Math.round(group.percentage)}%
                  </span>
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} shadow-sm group-hover:opacity-90 transition-all`}
                  style={{ width: `${group.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Simple aggregation (sum/count/avg)
  return (
    <div className="flex flex-col items-center justify-center text-center w-full h-full">
      <div className="text-xs font-semibold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-full mb-2 tracking-wide uppercase shadow-sm border border-blue-100/50 z-10">
        {data.aggregationType === "count"
          ? 'סה"כ רשומות'
          : `${data.aggregationType?.toUpperCase()} | ${data.field}`}
      </div>

      <div className="text-4xl font-black tracking-tight z-10 my-1 bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent transform group-hover:scale-110 transition-transform duration-300">
        {data.aggregationType === "sum" || data.aggregationType === "avg"
          ? `₪${Math.round(data.result).toLocaleString()}`
          : data.result.toLocaleString()}
      </div>

      <div className="text-xs text-gray-500 font-medium z-10 flex items-center gap-1 mt-1">
        <span>מבוסס על</span>
        <span className="font-bold text-gray-700 bg-white/50 px-1 rounded">
          {data.count.toLocaleString()}
        </span>
        <span>רשומות</span>
      </div>
    </div>
  );
}

function LegendView({ title, data }: { title: string; data: any }) {
  return (
    <div className="space-y-2">
      {data.items?.map((item: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className={`w-4 h-4 rounded border`}
            style={{
              backgroundColor: item.color || "#e5e7eb",
              borderColor: item.color
                ? adjustColorBrightness(item.color, -20)
                : "#d1d5db",
            }}
          />
          <div className="flex-1">
            <span className="text-sm text-gray-600">{item.label}</span>
            {item.description && (
              <span className="text-xs text-gray-400 ml-2">
                {item.description}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartView({ title, data }: { title: string; data: any }) {
  // For now, render as aggregation view
  // In the future, you can add actual chart libraries here
  return <AggregationView title={title} data={data} />;
}

// Helper function to adjust color brightness
function adjustColorBrightness(color: string, amount: number): string {
  // Simple implementation - in production, use a proper color library
  return color;
}
