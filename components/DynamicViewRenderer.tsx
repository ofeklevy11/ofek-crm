"use client";

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
    default:
      return (
        <div className="text-sm text-gray-500">Unknown view type: {type}</div>
      );
  }
}

function StatsView({ title, data }: { title: string; data: any }) {
  const timeRangeLabels = {
    week: "השבוע",
    month: "החודש",
    all: "כל הזמנים",
  };

  const colors = {
    week: { bg: "bg-blue-50", text: "text-blue-600" },
    month: { bg: "bg-purple-50", text: "text-purple-600" },
    all: { bg: "bg-gray-50", text: "text-gray-600" },
  };

  const color = colors[data.timeRange as keyof typeof colors] || colors.all;

  return (
    <div className="space-y-2">
      <div className={`${color.bg} p-3 rounded-lg text-center`}>
        <div className={`text-2xl font-bold ${color.text}`}>
          {data.count.toLocaleString()}
          {data.isOverLimit && <span>+</span>}
        </div>
        <div className={`text-xs ${color.text} font-medium`}>
          {timeRangeLabels[data.timeRange as keyof typeof timeRangeLabels] ||
            "ספירה"}
        </div>
      </div>
      {data.isOverLimit && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs text-orange-800">
          <div className="font-semibold">📊 מעל 1,000 רשומות</div>
          <div className="mt-1">
            לצפייה במלוא הנתונים, יש לשדרג את החבילה. צור קשר עם התמיכה.
          </div>
        </div>
      )}
    </div>
  );
}

function AggregationView({ title, data }: { title: string; data: any }) {
  if (data.error) {
    return <div className="text-sm text-red-500">{data.error}</div>;
  }

  // Group-by aggregation
  if (data.groups) {
    return (
      <div className="space-y-3">
        {data.groups.map((group: any, index: number) => {
          const defaultColors = [
            "bg-blue-500",
            "bg-purple-500",
            "bg-green-500",
            "bg-orange-500",
            "bg-pink-500",
            "bg-indigo-500",
            "bg-teal-500",
            "bg-red-500",
          ];

          const color =
            data.colorMapping?.[group.label] ||
            defaultColors[index % defaultColors.length];

          return (
            <div key={group.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{group.label}</span>
                <span className="font-medium text-gray-900">
                  {group.count} ({Math.round(group.percentage)}%)
                  {data.aggregationType === "sum" &&
                    data.targetField &&
                    ` - ₪${group.sum.toLocaleString()}`}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
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
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-4 rounded-lg">
      <div className="text-sm text-gray-600 font-medium mb-1">
        {data.aggregationType === "count"
          ? 'סה"כ רשומות'
          : `${data.aggregationType?.toUpperCase()} of ${data.field}`}
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {data.aggregationType === "sum" || data.aggregationType === "avg"
          ? `₪${Math.round(data.result).toLocaleString()}`
          : data.result.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        מבוסס על {data.count.toLocaleString()} רשומות
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
