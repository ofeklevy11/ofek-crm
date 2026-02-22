"use client";

import React, { useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  Timer,
  ChevronDown,
  ChevronUp,
  User,
  RefreshCw,
} from "lucide-react";
import { showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface TaskSheetItem {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  category?: string | null;
  order: number;
  isCompleted: boolean;
  completedAt?: string | null;
  dueTime?: string | null;
  notes?: string | null;
  linkedTask?: {
    id: string;
    title: string;
    status: string;
    priority?: string | null;
  } | null;
}

interface TaskSheet {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  validFrom: string;
  validUntil?: string | null;
  items: TaskSheetItem[];
  createdBy: {
    id: number;
    name: string;
  };
}

interface MyTaskSheetsProps {
  initialSheets: TaskSheet[];
}

const priorityConfig: Record<
  string,
  { color: string; bgColor: string; icon: React.ReactNode; label: string }
> = {
  URGENT: {
    color: "text-red-400",
    bgColor: "bg-red-500/20 border-red-500/30",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "דחוף",
  },
  HIGH: {
    color: "text-orange-400",
    bgColor: "bg-orange-500/20 border-orange-500/30",
    icon: <Timer className="w-4 h-4" />,
    label: "גבוה",
  },
  NORMAL: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/20 border-blue-500/30",
    icon: <Circle className="w-4 h-4" />,
    label: "רגיל",
  },
  LOW: {
    color: "text-slate-400",
    bgColor: "bg-slate-500/20 border-slate-500/30",
    icon: <Circle className="w-4 h-4" />,
    label: "נמוך",
  },
  OPPORTUNITY: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20 border-emerald-500/30",
    icon: <Sparkles className="w-4 h-4" />,
    label: "הזדמנות",
  },
};

export default function MyTaskSheets({ initialSheets }: MyTaskSheetsProps) {
  const [sheets, setSheets] = useState<TaskSheet[]>(initialSheets);
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(
    new Set(initialSheets.map((s) => s.id)),
  );
  const [loading, setLoading] = useState<Record<number, boolean>>({});

  const toggleSheet = (sheetId: number) => {
    setExpandedSheets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sheetId)) {
        newSet.delete(sheetId);
      } else {
        newSet.add(sheetId);
      }
      return newSet;
    });
  };

  const toggleItemCompletion = async (itemId: number) => {
    setLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const { toggleTaskSheetItemCompletion } = await import("@/app/actions");
      const result = await toggleTaskSheetItemCompletion(itemId);

      if (result.success && result.data) {
        setSheets((prev) =>
          prev.map((sheet) => ({
            ...sheet,
            items: sheet.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    isCompleted: result.data!.isCompleted,
                    completedAt:
                      result.data!.completedAt?.toISOString() || null,
                  }
                : item,
            ),
          })),
        );
        toast.success(result.data.isCompleted ? "המשימה הושלמה בהצלחה" : "המשימה סומנה כלא הושלמה");
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleResetSheet = async (sheetId: number) => {
    if (
      !(await showConfirm(
        "האם אתה בטוח שברצונך לאפס את דף המשימות? כל המשימות שהושלמו יסומנו מחדש כלא הושלמו.",
      ))
    ) {
      return;
    }

    try {
      const { resetTaskSheetItems } = await import("@/app/actions");
      const result = await resetTaskSheetItems(sheetId);

      if (result.success) {
        setSheets((prev) =>
          prev.map((sheet) =>
            sheet.id === sheetId
              ? {
                  ...sheet,
                  items: sheet.items.map((item) => ({
                    ...item,
                    isCompleted: false,
                    completedAt: null,
                  })),
                }
              : sheet,
          ),
        );
        toast.success("דף המשימות אופס בהצלחה");
      }
    } catch (error) {
      console.error("Error resetting sheet:", error);
      toast.error(getUserFriendlyError(error));
    }
  };

  const getProgress = (items: TaskSheetItem[]) => {
    if (items.length === 0) return 0;
    const completed = items.filter((item) => item.isCompleted).length;
    return Math.round((completed / items.length) * 100);
  };

  const sortedItems = (items: TaskSheetItem[]) => {
    const priorityOrder = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      OPPORTUNITY: 3,
      LOW: 4,
    };
    return [...items].sort((a, b) => {
      // Completed items go to the bottom
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1;
      }
      // Then sort by priority
      const aPriority =
        priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const bPriority =
        priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      // Then by order
      return a.order - b.order;
    });
  };

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Calendar className="w-16 h-16 mb-4 opacity-50" />
        <h3 className="text-xl font-medium mb-2">אין דפי משימות</h3>
        <p className="text-sm">אין לך כרגע דפי משימות מוקצים</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sheets.map((sheet) => {
        const progress = getProgress(sheet.items);
        const isExpanded = expandedSheets.has(sheet.id);
        const items = sortedItems(sheet.items);
        const completedCount = sheet.items.filter((i) => i.isCompleted).length;
        const urgentCount = sheet.items.filter(
          (i) =>
            !i.isCompleted &&
            (i.priority === "URGENT" || i.priority === "HIGH"),
        ).length;

        return (
          <div
            key={sheet.id}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl"
          >
            {/* Sheet Header */}
            <div
              onClick={() => toggleSheet(sheet.id)}
              className="w-full p-5 flex flex-col md:flex-row items-center justify-between hover:bg-slate-700/30 transition-colors cursor-pointer gap-4 md:gap-0"
            >
              <div className="flex items-center justify-between w-full md:w-auto">
                <div className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-xl ${
                      sheet.type === "DAILY"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600"
                        : "bg-gradient-to-br from-purple-500 to-purple-600"
                    }`}
                  >
                    {sheet.type === "DAILY" ? (
                      <Clock className="w-6 h-6 text-white" />
                    ) : (
                      <Calendar className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="text-start">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      {sheet.title}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          sheet.type === "DAILY"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-purple-500/20 text-purple-400"
                        }`}
                      >
                        {sheet.type === "DAILY" ? "יומי" : "שבועי"}
                      </span>
                    </h3>
                    {sheet.description && (
                      <p className="text-sm text-slate-400 mt-0.5">
                        {sheet.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        נוצר ע"י {sheet.createdBy.name}
                      </span>
                      {urgentCount > 0 && (
                        <span className="flex items-center gap-1 text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          {urgentCount} דחופים
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Mobile Chevron */}
                <div className="md:hidden">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto flex-col md:flex-row">
                {/* Button Section */}
                <div className="w-full md:w-auto md:order-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetSheet(sheet.id);
                    }}
                    className="w-full md:w-auto justify-center flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 rounded-lg transition-colors md:ml-2"
                    title="איפוס דף משימות"
                  >
                    <RefreshCw className="w-4 h-4" />
                    איפוס דף המשימות
                  </button>
                </div>

                {/* Progress Section */}
                <div className="flex items-center gap-3 w-full md:w-auto md:order-1 justify-between md:justify-end">
                  <div className="flex-1 flex md:block items-center justify-between md:text-end">
                    <div className="text-2xl font-bold text-white">
                      {progress}%
                    </div>
                    <div className="text-xs text-slate-400">
                      {completedCount}/{sheet.items.length} הושלמו
                    </div>
                  </div>
                  <div className="w-16 h-16 relative flex-shrink-0">
                    <svg
                      className="w-full h-full -rotate-90"
                      viewBox="0 0 36 36"
                    >
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-slate-700"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${progress} 100`}
                        className={
                          progress === 100
                            ? "text-emerald-500"
                            : progress >= 70
                              ? "text-blue-500"
                              : progress >= 40
                                ? "text-yellow-500"
                                : "text-red-500"
                        }
                        strokeLinecap="round"
                      />
                    </svg>
                    {progress === 100 && (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                {/* Desktop Chevron */}
                <div className="hidden md:block md:order-3">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Items List */}
            {isExpanded && (
              <div className="border-t border-slate-700/50">
                {items.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <Circle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>אין פריטים בדף משימה זה</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-700/30">
                    {items.map((item) => {
                      const config =
                        priorityConfig[item.priority] || priorityConfig.NORMAL;
                      const isLoading = loading[item.id];

                      return (
                        <li
                          key={item.id}
                          className={`p-4 flex items-start gap-4 transition-all ${
                            item.isCompleted
                              ? "bg-slate-900/30 opacity-60"
                              : "hover:bg-slate-700/20"
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleItemCompletion(item.id)}
                            disabled={isLoading}
                            className={`flex-shrink-0 mt-0.5 transition-all ${
                              isLoading ? "opacity-50" : ""
                            }`}
                          >
                            {item.isCompleted ? (
                              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                            ) : (
                              <Circle
                                className={`w-6 h-6 ${config.color} hover:scale-110 transition-transform`}
                              />
                            )}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-medium ${
                                  item.isCompleted
                                    ? "line-through text-slate-500"
                                    : "text-white"
                                }`}
                              >
                                {item.title}
                              </span>
                              {item.category && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">
                                  {item.category}
                                </span>
                              )}
                              {item.linkedTask && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                                  🔗 {item.linkedTask.title}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p
                                className={`text-sm mt-1 ${
                                  item.isCompleted
                                    ? "text-slate-600"
                                    : "text-slate-400"
                                }`}
                              >
                                {item.description}
                              </p>
                            )}
                            {item.dueTime && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                {item.dueTime}
                              </div>
                            )}
                            {item.isCompleted && item.completedAt && (
                              <div className="text-xs text-emerald-500/70 mt-1">
                                ✓ הושלם ב-
                                {new Date(item.completedAt).toLocaleString(
                                  "he-IL",
                                  {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  },
                                )}
                              </div>
                            )}
                          </div>

                          {/* Priority Badge */}
                          <div
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg border ${config.bgColor} ${config.color} flex items-center gap-1.5 text-sm font-medium`}
                          >
                            {config.icon}
                            {config.label}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
