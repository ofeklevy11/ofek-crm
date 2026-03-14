"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const COLORS = [
  "#6366f1", // Indigo 500
  "#8b5cf6", // Violet 500
  "#ec4899", // Pink 500
  "#f43f5e", // Rose 500
  "#f59e0b", // Amber 500
  "#10b981", // Emerald 500
  "#3b82f6", // Blue 500
  "#06b6d4", // Cyan 500
];

interface AnalyticsGraphProps {
  data: any[];
  type?: string; // bar, line, pie, area
  height?: number;
  title?: string;
}

export default function AnalyticsGraph({
  data,
  type = "bar",
  height = 300,
  title,
}: AnalyticsGraphProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
        role="status"
      >
        אין מספיק נתונים להצגה
      </div>
    );
  }

  const renderChart = () => {
    switch (type.toLowerCase()) {
      case "line":
        return (
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#eee"
            />
            <XAxis
              dataKey="name"
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                border: "1px solid #f3f4f6",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ stroke: "#6366f1", strokeWidth: 2, r: 4, fill: "#fff" }}
              activeDot={{ r: 6 }}
              name="ערך"
            />
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#eee"
            />
            <XAxis
              dataKey="name"
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                border: "1px solid #f3f4f6",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              fillOpacity={1}
              fill="url(#colorValue)"
              name="ערך"
            />
          </AreaChart>
        );

      case "pie":
        const outerRadius = height / 2 - 60; // Increased padding to prevent label cutoff
        const innerRadius = outerRadius - 40; // Maintain ring thickness

        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={4}
              dataKey="value"
              nameKey="name"
              label={({
                cx,
                cy,
                midAngle,
                innerRadius,
                outerRadius,
                value,
                index,
                name,
                percent,
              }) => {
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 20; // Adjusted for better label positioning
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);

                return (
                  <text
                    x={x}
                    y={y}
                    fill="#374151"
                    textAnchor={x > cx ? "start" : "end"}
                    dominantBaseline="central"
                    className="text-[10px] font-medium"
                    fontSize={10}
                  >
                    <tspan
                      x={x}
                      dy="-0.6em"
                      className="fill-gray-900 font-bold"
                      fontWeight="bold"
                    >
                      {name}
                    </tspan>
                    <tspan
                      x={x}
                      dy="1.4em"
                      className="fill-gray-500 text-[9px]"
                      fontSize={9}
                      fill="#6b7280"
                    >
                      {`(${(percent * 100).toFixed(0)}%) ${value}`}
                    </tspan>
                  </text>
                );
              }}
              labelLine={{
                stroke: "#e5e7eb",
                strokeWidth: 1,
              }}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                border: "1px solid #f3f4f6",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                direction: "rtl",
              }}
              formatter={(value: any, name: string) => [
                value.toLocaleString(),
                name,
              ]}
            />
          </PieChart>
        );

      default: // Bar
        return (
          <BarChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#eee"
            />
            <XAxis
              dataKey="name"
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "#f9fafb" }}
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                border: "1px solid #f3f4f6",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
            />
            <Legend />
            <Bar
              dataKey="value"
              fill="#6366f1"
              radius={[4, 4, 0, 0]}
              name="ערך"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        );
    }
  };

  return (
    <div style={{ width: "100%", height }} role="img" aria-label={title || "גרף אנליטיקה"}>
      <ResponsiveContainer>{renderChart()}</ResponsiveContainer>
      <table className="sr-only">
        <caption>{title || "נתוני גרף"}</caption>
        <thead><tr><th scope="col">קטגוריה</th><th scope="col">ערך</th></tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{d.name}</td><td>{d.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
