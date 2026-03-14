"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Settings, Eye, EyeOff, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { GoalWithProgress } from "@/app/actions/goals";
import { Progress } from "@/components/ui/progress";
import { useState, memo } from "react";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { format } from "date-fns";
import GoalContextExplanation from "@/components/finance/GoalContextExplanation";

interface GoalsTableWidgetProps {
  id: string; // The DND id
  title?: string;
  goals: GoalWithProgress[];
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  settings?: any;
  tables?: any[];
}

function GoalsTableWidget({
  id,
  title = "טבלת יעדים",
  goals,
  onRemove,
  onEdit,
  settings,
  tables = [],
}: GoalsTableWidgetProps) {
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

  const statusConfig: any = {
    ON_TRACK: {
      color: "text-[#3B82F6]",
      bg: "bg-[#3B82F6]/10",
      progressColor: "bg-[#3B82F6]",
      label: "במסלול",
    },
    WARNING: {
      color: "text-[#F59E0B]",
      bg: "bg-[#F59E0B]/10",
      progressColor: "bg-[#F59E0B]",
      label: "בסיכון",
    },
    CRITICAL: {
      color: "text-[#EF4444]",
      bg: "bg-[#EF4444]/10",
      progressColor: "bg-[#EF4444]",
      label: "קריטי",
    },
    EXCEEDED: {
      color: "text-[#10B981]",
      bg: "bg-[#10B981]/10",
      progressColor: "bg-[#10B981]",
      label: "מצוין",
    },
  };

  const formatValue = (val: number, goal: GoalWithProgress) => {
    return new Intl.NumberFormat("he-IL", {
      style:
        goal.metricType.includes("REVENUE") ||
        goal.metricType.includes("SALES") ||
        goal.targetType?.toUpperCase() === "SUM"
          ? "currency"
          : "decimal",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-indigo-100 overflow-hidden ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      {/* Top Accent - Purple/Blue Gradient */}
      <div className="h-1.5 w-full bg-linear-to-r from-[#4f95ff] to-[#a24ec1]" aria-hidden="true" />

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
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-100">
                יעדים
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{goals.length} יעדים פעילים</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={handleToggleCollapse}
              aria-label={isCollapsed ? "הצג תוכן ווידג׳ט" : "הסתר תוכן ווידג׳ט"}
              title={isCollapsed ? "הצג" : "הסתר"}
            >
              {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(id);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="הגדרות ווידג׳ט"
              title="ערוך"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="הסר ווידג׳ט מהדאשבורד"
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
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-right text-sm text-gray-500 border-b border-gray-100">
                  <th scope="col" className="pb-3 font-medium">שם היעד</th>
                  <th scope="col" className="pb-3 font-medium w-24 text-center">סטטוס</th>
                  <th scope="col" className="pb-3 font-medium w-32 text-center">התקדמות</th>
                  <th scope="col" className="pb-3 font-medium text-center">נוכחי / יעד</th>
                  <th scope="col" className="pb-3 font-medium text-center">סיום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {goals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      לא נבחרו יעדים להצגה
                    </td>
                  </tr>
                ) : (
                  goals.map((goal) => {
                    const stat =
                      statusConfig[goal.status] || statusConfig.ON_TRACK;
                    return (
                      <tr
                        key={goal.id}
                        className="group/row hover:bg-gray-50/50 transition-colors"
                      >
                        <td
                          className="py-4 font-semibold text-gray-900 group-hover/row:text-[#4f95ff] transition-colors max-w-[300px]"
                          title={goal.name}
                        >
                          <div className="flex flex-col gap-1">
                            <span>{goal.name}</span>
                            <GoalContextExplanation
                              goal={goal}
                              tables={tables}
                              mode="table"
                            />
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${stat.bg} ${stat.color}`}
                          >
                            {stat.label}
                          </span>
                        </td>
                        <td className="py-4 w-32 text-center">
                          <div className="flex flex-col gap-1.5 w-full max-w-24 mx-auto">
                            <div className="flex justify-center text-xs text-gray-500 font-medium">
                              <span>{goal.progressPercent}%</span>
                            </div>
                            <Progress
                              value={goal.progressPercent}
                              className="h-2 w-full bg-[#F3F4F6]"
                              indicatorClassName={stat.progressColor}
                              aria-label={`התקדמות יעד ${goal.name}: ${goal.progressPercent}%`}
                            />
                          </div>
                        </td>
                        <td className="py-4 text-gray-700 text-sm text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-gray-900">
                              {formatValue(goal.currentValue, goal)}
                            </span>
                            <span className="text-xs text-gray-500">
                              מתוך {formatValue(goal.targetValue, goal)}
                            </span>
                          </div>
                        </td>
                        <td
                          className="py-4 text-gray-500 text-sm text-center font-medium"
                          dir="ltr"
                        >
                          {format(new Date(goal.endDate), "d/M/yy")}
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

export default memo(GoalsTableWidget);
