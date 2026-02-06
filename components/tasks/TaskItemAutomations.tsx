"use client";

import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Table,
  CheckSquare,
  DollarSign,
  Bell,
  Settings2,
  Globe,
  MessageCircle,
  Calendar,
  AlertCircle,
  Zap,
} from "lucide-react";
import TaskItemAutomationBuilder, {
  OnCompleteAction,
} from "./TaskItemAutomationBuilder";

interface TaskItemAutomationsProps {
  actions: OnCompleteAction[];
  onChange: (actions: OnCompleteAction[]) => void;
  users: Array<{ id: number; name: string }>;
  tables: Array<{ id: number; name: string }>;
  userPlan?: string;
  limit?: number;
  externalUsageCount?: number;
}

const actionTypes = [
  {
    value: "CREATE_TASK",
    label: "יצירת משימה חדשה",
    icon: CheckSquare,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  {
    value: "CREATE_FINANCE",
    label: "יצירת רשומת פיננסים",
    icon: DollarSign,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
  },
  {
    value: "SEND_NOTIFICATION",
    label: "שליחת התראה",
    icon: Bell,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  {
    value: "SEND_WEBHOOK",
    label: "שליחת Webhook",
    icon: Globe,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
  {
    value: "SEND_WHATSAPP",
    label: "שליחת הודעת וואטספ",
    icon: MessageCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    value: "CREATE_CALENDAR_EVENT",
    label: "יצירת אירוע ביומן",
    icon: Calendar,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
  },
  {
    value: "CREATE_RECORD",
    label: "יצירת רשומה בטבלה",
    icon: Table,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
  },
];

export default function TaskItemAutomations({
  actions,
  onChange,
  users,
  tables,
  userPlan = "basic",
  limit,
  externalUsageCount = 0,
}: TaskItemAutomationsProps) {
  const [isExpanded, setIsExpanded] = useState(actions.length > 0);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const limits: Record<string, number> = {
    basic: 2,
    premium: 6,
    super: Infinity,
  };

  // If a limit is provided via props, use it. Otherwise use the plan limit.
  // Note: The parent should pass the GLOBAL plan limit here, not the "remaining" limit.
  const globalLimit = limit ?? limits[userPlan] ?? 2;
  const currentTotalUsage = actions.length + externalUsageCount;

  const isLimitReached =
    globalLimit !== Infinity && currentTotalUsage >= globalLimit;

  const planLabels: Record<string, string> = {
    basic: "משתמש רגיל",
    premium: "משתמש פרימיום",
    super: "משתמש Super",
  };

  const handleAddAction = () => {
    if (isLimitReached) return;
    setEditingIndex(null);
    setShowBuilder(true);
  };

  const handleEditAction = (index: number) => {
    setEditingIndex(index);
    setShowBuilder(true);
  };

  const handleDeleteAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const handleSaveAction = (action: OnCompleteAction) => {
    if (editingIndex !== null) {
      // Edit existing
      const newActions = [...actions];
      newActions[editingIndex] = action;
      onChange(newActions);
    } else {
      // Add new
      onChange([...actions, action]);
    }
    setShowBuilder(false);
    setEditingIndex(null);
  };

  const getActionInfo = (actionType: string) => {
    return (
      actionTypes.find((t) => t.value === actionType) || {
        label: actionType,
        icon: Settings2,
        color: "text-gray-600",
        bgColor: "bg-gray-50",
      }
    );
  };

  const getActionSummary = (action: OnCompleteAction): string => {
    switch (action.actionType) {
      case "SEND_NOTIFICATION":
        return action.config.title
          ? `"${action.config.title}"`
          : "התראה למשתמש";
      case "CREATE_TASK":
        return action.config.title ? `"${action.config.title}"` : "משימה חדשה";
      case "SEND_WHATSAPP":
        return action.config.phone
          ? `ל-${action.config.phone}`
          : "הודעת וואטספ";
      case "SEND_WEBHOOK":
        return action.config.url ? "שליחת נתונים" : "Webhook";
      case "UPDATE_RECORD":
        return action.config.tableId ? "עדכון רשומה" : "עדכון טבלה";
      case "CREATE_RECORD":
        return action.config.tableId ? "יצירת רשומה" : "יצירת רשומה בטבלה";
      case "CREATE_FINANCE":
        return action.config.title
          ? `"${action.config.title}"`
          : "רשומה פיננסית";
      case "UPDATE_TASK":
        return action.config.taskId
          ? `משימה #${action.config.taskId}`
          : "עדכון משימה";
      case "CREATE_CALENDAR_EVENT":
        return action.config.title ? `"${action.config.title}"` : "אירוע ביומן";
      default:
        return "";
    }
  };

  return (
    <>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-semibold text-gray-900">
              אוטומציות בהשלמה
            </span>
            {actions.length > 0 && (
              <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                {actions.length}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {isExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-100 bg-gray-50/50">
            {/* Plan Disclaimer */}
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                globalLimit === Infinity
                  ? "bg-purple-50 border-purple-200 text-purple-800"
                  : isLimitReached
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {globalLimit === Infinity ? (
                <Zap className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold mb-0.5">
                  {globalLimit === Infinity
                    ? "ללא הגבלה"
                    : `ניצול אוטומציות במכלול דף המשימות: ${currentTotalUsage} מתוך ${globalLimit}`}
                </p>
                <p className="opacity-90">
                  אתה מוגדר כ{planLabels[userPlan] || userPlan}. מספר הפעולות
                  שניתן להוסיף <b>לכלל המשימות בדף</b> הוא{" "}
                  {globalLimit === Infinity
                    ? "ללא הגבלה"
                    : `עד ${globalLimit} פעולות`}
                  .
                </p>
                {/* Progress bar */}
                {globalLimit !== Infinity && (
                  <div className="mt-2 h-2 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isLimitReached
                          ? "bg-amber-500"
                          : "bg-gradient-to-r from-blue-500 to-purple-500"
                      }`}
                      style={{
                        width: `${Math.min((currentTotalUsage / globalLimit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {actions.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm text-gray-600 font-medium mb-1">
                  לא הוגדרו אוטומציות
                </p>
                <p className="text-xs text-gray-400">
                  הוסף פעולה שתרוץ בעת השלמת השלב
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {actions.map((action, index) => {
                  const actionInfo = getActionInfo(action.actionType);
                  const Icon = actionInfo.icon;
                  const summary = getActionSummary(action);

                  return (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div
                        className={`p-2.5 rounded-lg ${actionInfo.bgColor} ${actionInfo.color}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {actionInfo.label}
                        </p>
                        {summary && (
                          <p className="text-xs text-gray-500 truncate">
                            {summary}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleEditAction(index)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ערוך אוטומציה"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAction(index)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="מחק אוטומציה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddAction}
              disabled={isLimitReached}
              className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-3 border border-dashed rounded-xl transition-all ${
                isLimitReached
                  ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                  : "border-blue-300 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-600 hover:text-blue-700 hover:border-blue-400 hover:shadow-sm"
              }`}
            >
              {isLimitReached ? (
                <>
                  <Zap className="w-4 h-4" />
                  הגעת למגבלת האוטומציות לתוכנית שלך
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  הוסף אוטומציה חדשה
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Automation Builder Modal */}
      <TaskItemAutomationBuilder
        isOpen={showBuilder}
        onClose={() => {
          setShowBuilder(false);
          setEditingIndex(null);
        }}
        onSave={handleSaveAction}
        initialAction={editingIndex !== null ? actions[editingIndex] : null}
        users={users}
        tables={tables}
      />
    </>
  );
}
