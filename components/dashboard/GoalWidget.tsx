"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Trash2,
  Settings,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { memo } from "react";
import { useRouter } from "next/navigation";
import { GoalWithProgress } from "@/app/actions/goals";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import GoalContextExplanation from "@/components/finance/GoalContextExplanation";

interface GoalWidgetProps {
  id: string; // The DND id
  goal: GoalWithProgress;
  metrics: any[];
  tables: any[];
  onRemove: (id: string) => void;
}

function GoalWidget({
  id,
  goal,
  metrics,
  tables,
  onRemove,
}: GoalWidgetProps) {
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

  // Maps for style based on status
  // Traffic Light Logic
  const statusConfig = {
    ON_TRACK: {
      color: "text-[#3B82F6]",
      bg: "bg-[#3B82F6]/10",
      accent: "bg-[#3B82F6]",
      icon: CheckCircle,
      label: "במסלול",
    },
    WARNING: {
      color: "text-[#F59E0B]",
      bg: "bg-[#F59E0B]/10",
      accent: "bg-[#F59E0B]",
      icon: AlertTriangle,
      label: "בסיכון",
    },
    CRITICAL: {
      color: "text-[#EF4444]",
      bg: "bg-[#EF4444]/10",
      accent: "bg-[#EF4444]",
      icon: AlertTriangle,
      label: "קריטי",
    },
    EXCEEDED: {
      color: "text-[#10B981]",
      bg: "bg-[#10B981]/10",
      accent: "bg-[#10B981]",
      icon: TrendingUp,
      label: "מצוין",
    },
  };

  const status = statusConfig[goal.status] || statusConfig.ON_TRACK;
  const Icon = status.icon;

  const formattedTarget = new Intl.NumberFormat("he-IL", {
    style:
      goal.metricType.includes("REVENUE") ||
      goal.metricType.includes("SALES") ||
      goal.targetType?.toUpperCase() === "SUM"
        ? "currency"
        : "decimal",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(goal.targetValue);

  const formattedCurrent = new Intl.NumberFormat("he-IL", {
    style:
      goal.metricType.includes("REVENUE") ||
      goal.metricType.includes("SALES") ||
      goal.targetType?.toUpperCase() === "SUM"
        ? "currency"
        : "decimal",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(goal.currentValue);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex flex-col justify-between bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 border border-gray-100 overflow-hidden cursor-grab active:cursor-grabbing h-full min-h-[200px]"
    >
      {/* Top Accent Line */}
      <div className={`h-1.5 w-full shrink-0 ${status.accent}`} />

      <div className="p-6 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.bg} ${status.color} border-transparent`}
              >
                {status.label}
              </span>
              <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {goal.daysRemaining} ימים נותרו
              </span>
            </div>
            <h3
              className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight mb-4"
              title={goal.name}
            >
              {goal.name}
            </h3>
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-medium text-gray-400">
                  התחלנו
                </span>
                <span className="text-xs font-bold text-gray-700 tracking-tight">
                  {format(new Date(goal.startDate), "d MMM, yyyy", {
                    locale: he,
                  })}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-medium text-gray-400">
                  יעד לסיום
                </span>
                <span className="text-xs font-bold text-gray-700 tracking-tight">
                  {format(new Date(goal.endDate), "d MMM, yyyy", {
                    locale: he,
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push("/finance/goals");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
              title="הגדרות"
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
        <div className="flex-1 flex flex-col justify-end gap-3 mt-2">
          <div className="flex justify-between items-end">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">
              {formattedCurrent}
            </span>
            <span className="text-sm font-medium text-gray-500 mb-1.5">
              יעד: {formattedTarget}
            </span>
          </div>

          <div className="space-y-1.5">
            <Progress
              value={goal.progressPercent}
              className="h-2.5 bg-[#F3F4F6]"
              indicatorClassName={status.accent}
            />
            <div className="flex justify-between text-[10px] text-gray-400 font-medium px-0.5">
              <span>{goal.progressPercent}% הושלמו</span>
            </div>
          </div>
        </div>
        <GoalContextExplanation goal={goal} tables={tables} />
      </div>
    </div>
  );
}

export default memo(GoalWidget);
