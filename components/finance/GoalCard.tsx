"use client";

import { GoalWithProgress } from "@/app/actions/goals";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import GoalModal from "./GoalModal";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

interface GoalCardProps {
  goal: GoalWithProgress;
  metrics: any[];
  tables: any[];
}

export default function GoalCard({ goal, metrics, tables }: GoalCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  // Status config
  const statusConfig = {
    ON_TRACK: {
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      icon: CheckCircle,
      label: "On Track",
    },
    WARNING: {
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: AlertTriangle,
      label: "At Risk",
    },
    CRITICAL: {
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      icon: AlertTriangle,
      label: "Off Track",
    },
    EXCEEDED: {
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-200",
      icon: TrendingUp,
      label: "Crushing It!",
    },
  };

  const status = statusConfig[goal.status];
  const Icon = status.icon;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this goal?")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/finance/goals/${goal.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast({
        title: "Success",
        description: "Goal deleted",
      });
      router.refresh();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to delete goal",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedTarget = new Intl.NumberFormat("en-US", {
    style:
      goal.metricType.includes("REVENUE") ||
      goal.metricType.includes("SALES") ||
      goal.targetType?.toUpperCase() === "SUM"
        ? "currency"
        : "decimal",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(goal.targetValue);

  const formattedCurrent = new Intl.NumberFormat("en-US", {
    style:
      goal.metricType.includes("REVENUE") ||
      goal.metricType.includes("SALES") ||
      goal.targetType?.toUpperCase() === "SUM"
        ? "currency"
        : "decimal",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(goal.currentValue);

  const formattedProjected = new Intl.NumberFormat("en-US", {
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
      } ${goal.isActive ? "opacity-100" : "opacity-60 grayscale"}`}
    >
      {/* Background Decor */}
      <div
        className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 ${status.bg.replace(
          "bg-",
          "bg-"
        )}`}
      />

      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {goal.metricType === "REVENUE" && (
              <DollarSign className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "RETAINERS" && (
              <Briefcase className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "LEADS" && (
              <Users className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "QUOTES" && (
              <FileText className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "TASKS" && (
              <CheckSquare className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "CALENDAR" && (
              <Calendar className="w-5 h-5 text-indigo-600" />
            )}
            {goal.metricType === "RECORDS" && (
              <Table className="w-5 h-5 text-indigo-600" />
            )}
            <h3 className="font-bold text-lg text-gray-900">{goal.name}</h3>
            {!goal.isActive && (
              <Badge variant="secondary" className="text-xs">
                Paused
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {format(new Date(goal.startDate), "MMM d")} -{" "}
            {format(new Date(goal.endDate), "MMM d, yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`${status.bg} ${status.color} border-0 px-3 py-1`}>
            {status.label}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <GoalModal
                existingGoal={goal}
                metrics={metrics}
                tables={tables}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    Edit
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={handleDelete}
              >
                Delete
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
              Target: {formattedTarget}
            </span>
          </div>

          <div className="relative">
            <Progress value={goal.progressPercent} className="h-3" />
            {/* Markers for thresholds could go here */}
          </div>

          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{goal.progressPercent}% Achieved</span>
            <span>{goal.daysRemaining} days left</span>
          </div>
        </div>

        {goal.recommendation && (
          <div
            className={`p-3 rounded-lg text-sm flex gap-3 items-start ${status.bg}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${status.color}`} />
            <div>
              <p className={`font-medium ${status.color}`}>Assistant Insight</p>
              <p className="text-gray-700 mt-0.5">{goal.recommendation}</p>
              {goal.status !== "EXCEEDED" && goal.status !== "ON_TRACK" && (
                <div className="mt-2 text-xs text-gray-500 font-medium">
                  Projected Finish: {formattedProjected}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
