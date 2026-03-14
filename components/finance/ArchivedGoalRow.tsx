"use client";

import GoalContextExplanation from "./GoalContextExplanation";
import { GoalWithProgress, toggleGoalArchive } from "@/app/actions/goals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Briefcase,
  Calendar,
  CheckCircle,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  MoreHorizontal,
  RefreshCcw,
  Table as TableIcon,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
  Activity,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, throwResponseError } from "@/lib/api-fetch";
import { getUserFriendlyError } from "@/lib/errors";

const currencyCompactFmt = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0, notation: "compact" });
const decimalCompactFmt = new Intl.NumberFormat("he-IL", { style: "decimal", maximumFractionDigits: 0, notation: "compact" });
const currencyFullFmt = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const decimalFullFmt = new Intl.NumberFormat("he-IL", { style: "decimal", minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface ArchivedGoalRowProps {
  goal: GoalWithProgress;
  tables: { id: number; name: string }[];
}

export default function ArchivedGoalRow({
  goal,
  tables,
}: ArchivedGoalRowProps) {
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await toggleGoalArchive(goal.id, false);
      toast.success("היעד שוחזר");
      router.refresh();
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!(await showConfirm({ message: "האם אתה בטוח שברצונך למחוק את היעד לצמיתות?", variant: "destructive" }))) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/finance/goals/${goal.id}`, {
        method: "DELETE",
      });
      if (!res.ok) await throwResponseError(res, "Failed to delete goal");
      toast.success("היעד נמחק");
      router.refresh();
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setIsDeleting(false);
    }
  };

  // Logic for status
  const isTimeEnded = new Date() > new Date(goal.endDate);
  const isSuccess = goal.progressPercent >= 100;

  const getIcon = () => {
    switch (goal.metricType) {
      case "REVENUE":
        return DollarSign;
      case "RETAINERS":
        return Briefcase;
      case "CUSTOMERS":
        return Users;
      case "QUOTES":
        return FileText;
      case "TASKS":
        return CheckSquare;
      case "CALENDAR":
        return Calendar;
      case "RECORDS":
        return TableIcon;
      default:
        return TrendingUp;
    }
  };

  const Icon = getIcon();
  const isMoney =
    ["REVENUE", "SALES"].includes(goal.metricType) || goal.targetType === "SUM";

  const compactFmt = isMoney ? currencyCompactFmt : decimalCompactFmt;
  const fullFmt = isMoney ? currencyFullFmt : decimalFullFmt;

  const formattedTarget = compactFmt.format(goal.targetValue);
  const formattedCurrent = compactFmt.format(goal.currentValue);
  const formatFullMoney = (val: number) => fullFmt.format(val);

  // Translate period
  const periodMap: Record<string, string> = {
    MONTHLY: "חודשי",
    QUARTERLY: "רבעוני",
    YEARLY: "שנתי",
    CUSTOM: "מותאם אישית",
  };

  return (
    <tr className="bg-white border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors group">
      {/* 1. Name & Metric */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors self-start mt-1",
              isSuccess
                ? "bg-green-50 border-green-100 text-green-600"
                : "bg-gray-50 border-gray-200 text-gray-500",
            )}
            aria-hidden="true"
          >
            {isSuccess ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Icon className="w-5 h-5" />
            )}
          </div>
          <div className="flex flex-col gap-2 w-full">
            <div>
              <h3 className="font-bold text-gray-900 text-base">{goal.name}</h3>
              <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                {goal.metricType === "REVENUE" && "הכנסות"}
                {goal.metricType === "CUSTOMERS" && " לקוחות"}
                {goal.metricType === "TASKS" && " משימות"}
                {goal.metricType === "QUOTES" && " הצעות מחיר"}
                {goal.metricType === "RECORDS" && " רשומות"}
                {goal.metricType === "CALENDAR" && " יומן"}
                {goal.metricType === "RETAINERS" && " ריטיינרים"}
              </p>
            </div>
            <div className="mt-1">
              <GoalContextExplanation goal={goal} tables={tables} mode="table" />
            </div>
          </div>
        </div>
      </td>

      {/* 2. Target vs Actual */}
      <td className="py-4 px-6 text-right">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-gray-900">
            {formattedCurrent}
          </span>
          <span className="text-sm text-gray-400 font-normal">
            / {formattedTarget}
          </span>
        </div>
        <div
          className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={goal.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`הושלמו ${goal.progressPercent} אחוז`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isSuccess ? "bg-green-500" : "bg-blue-500",
            )}
            style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          הושלמו {goal.progressPercent}%
        </p>
      </td>

      {/* 3. Date Range & Status */}
      <td className="py-4 px-6">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4 text-gray-400" aria-hidden="true" />
            <span dir="ltr">{format(new Date(goal.endDate), "dd/MM/yy")}</span>
            <span className="text-gray-300 mx-1" aria-hidden="true">➜</span>
            <span dir="ltr">{format(new Date(goal.startDate), "dd/MM/yy")}</span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            {isTimeEnded ? (
              <Badge
                variant="secondary"
                className="bg-gray-100 text-gray-500 text-[10px] h-5 px-2 font-normal border-gray-200"
              >
                הסתיים
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] h-5 px-2 font-normal"
              >
                <Activity className="w-3 h-3 mr-1" aria-hidden="true" />
                פעיל
              </Badge>
            )}
          </div>
        </div>
      </td>

      {/* 4. Achievement Status Badge */}
      <td className="py-4 px-6 text-center">
        {isSuccess ? (
          <Badge className="bg-green-100 hover:bg-green-100 text-green-700 border-green-200 shadow-none text-xs px-3 py-1">
            <CheckCircle className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
            עמד ביעד
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-600 border-red-200 text-xs px-3 py-1"
          >
            <XCircle className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
            לא הושג
          </Badge>
        )}
      </td>

      {/* 5. Actions */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-1 justify-end">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="h-9 w-9 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                  aria-label="שחזר יעד"
                >
                  <RefreshCcw className="w-4 h-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>שחזר יעד</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                  aria-label="מחק לצמיתות"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>מחק לצמיתות</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </td>
    </tr>
  );
}
