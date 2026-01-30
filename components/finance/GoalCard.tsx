"use client";

import { GoalWithProgress, toggleGoalArchive } from "@/app/actions/goals";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  MoreVertical,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Briefcase,
  Users,
  FileText,
  CheckSquare,
  Calendar,
  Table,
  Archive,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import GoalModal from "./GoalModal";
import GoalContextExplanation from "./GoalContextExplanation";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

interface GoalCardProps {
  goal: GoalWithProgress;
  metrics: any[];
  tables: any[];
  isDropdownOpen?: boolean;
  onDropdownOpenChange?: (open: boolean) => void;
}

export default function GoalCard({
  goal,
  metrics,
  tables,
  isDropdownOpen,
  onDropdownOpenChange,
}: GoalCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Status config - Traffic Light Logic
  const statusConfig = {
    ON_TRACK: {
      color: "text-[#3B82F6]", // Blue - Normal
      bg: "bg-[#3B82F6]/10",
      border: "border-[#3B82F6]/20",
      progressColor: "bg-[#3B82F6]",
      icon: CheckCircle,
      label: "במסלול",
    },
    WARNING: {
      color: "text-[#F59E0B]", // Orange - At Risk
      bg: "bg-[#F59E0B]/10",
      border: "border-[#F59E0B]/20",
      progressColor: "bg-[#F59E0B]",
      icon: AlertTriangle,
      label: "בסיכון",
    },
    CRITICAL: {
      color: "text-[#EF4444]", // Red - Critical
      bg: "bg-[#EF4444]/10",
      border: "border-[#EF4444]/20",
      progressColor: "bg-[#EF4444]",
      icon: AlertTriangle,
      label: "קריטי",
    },
    EXCEEDED: {
      color: "text-[#10B981]", // Green - Excellent
      bg: "bg-[#10B981]/10",
      border: "border-[#10B981]/20",
      progressColor: "bg-[#10B981]",
      icon: TrendingUp,
      label: "מצוין",
    },
  };

  const status = statusConfig[goal.status];
  const Icon = status.icon;

  const handleDelete = async () => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את היעד לצמיתות?")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/finance/goals/${goal.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast({
        title: "הצלחה",
        description: "היעד נמחק בהצלחה",
      });
      router.refresh();
    } catch (e) {
      toast({
        title: "שגיאה",
        description: "מחיקת היעד נכשלה",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await toggleGoalArchive(goal.id, !goal.isArchived);
      toast({
        title: "הצלחה",
        description: goal.isArchived
          ? "היעד שוחזר בהצלחה"
          : "היעד הועבר לארכיון",
      });
      router.refresh();
    } catch (e) {
      toast({
        title: "שגיאה",
        description: "פעולה נכשלה",
        variant: "destructive",
      });
    } finally {
      setIsArchiving(false);
    }
  };

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

  const formattedProjected = new Intl.NumberFormat("he-IL", {
    style:
      goal.metricType.includes("REVENUE") ||
      goal.metricType.includes("SALES") ||
      goal.targetType?.toUpperCase() === "SUM"
        ? "currency"
        : "decimal",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(goal.projectedValue);

  return (
    <Card
      className={`p-6 relative overflow-hidden transition-all hover:shadow-lg border-2 ${
        status.border
      } ${
        !goal.isActive || goal.isArchived
          ? "opacity-80 grayscale bg-gray-50"
          : "opacity-100 bg-white"
      }`}
      dir="rtl"
    >
      {/* Background Decor */}
      <div
        className={`absolute -left-6 -top-6 w-24 h-24 rounded-full opacity-10 pointer-events-none ${status.bg}`}
      />

      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {goal.metricType === "REVENUE" && (
              <DollarSign className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "RETAINERS" && (
              <Briefcase className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "CUSTOMERS" && (
              <Users className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "QUOTES" && (
              <FileText className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "TASKS" && (
              <CheckSquare className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "CALENDAR" && (
              <Calendar className="w-5 h-5 text-[#4f95ff]" />
            )}
            {goal.metricType === "RECORDS" && (
              <Table className="w-5 h-5 text-[#4f95ff]" />
            )}
            <h3 className="font-bold text-lg text-gray-900">{goal.name}</h3>
            {goal.isArchived && (
              <Badge
                variant="outline"
                className="text-xs border-gray-400 text-gray-500"
              >
                בארכיון
              </Badge>
            )}
            {!goal.isActive && !goal.isArchived && (
              <Badge variant="secondary" className="text-xs">
                מושהה
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {format(new Date(goal.startDate), "d MMM", { locale: he })} -{" "}
            {format(new Date(goal.endDate), "d MMM, yyyy", { locale: he })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!goal.isArchived && (
            <Badge
              className={`${status.bg} ${status.color} border-0 px-3 py-1`}
            >
              {status.label}
            </Badge>
          )}

          <DropdownMenu
            open={isDropdownOpen}
            onOpenChange={onDropdownOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-gray-100"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-right">
              <GoalModal
                existingGoal={goal}
                metrics={metrics}
                tables={tables}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    ערוך
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
                {goal.isArchived ? (
                  <>
                    <RefreshCcw className="w-4 h-4 ml-2" />
                    שחזר יעד
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4 ml-2" />
                    העבר לארכיון
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-700 focus:text-red-700 bg-red-50 focus:bg-red-100"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 ml-2" />
                מחק לצמיתות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-3xl font-bold text-gray-900">
              {formattedCurrent}
            </span>
            <span className="text-sm font-medium text-gray-500 mb-1">
              יעד: {formattedTarget}
            </span>
          </div>

          <div className="relative">
            <Progress
              value={goal.progressPercent}
              className="h-3 bg-[#F3F4F6]"
              indicatorClassName={status.progressColor}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{goal.progressPercent}% הושלמו</span>
            <span>{goal.daysRemaining} ימים נותרו</span>
          </div>
        </div>
      </div>

      <GoalContextExplanation goal={goal} tables={tables} />
    </Card>
  );
}
