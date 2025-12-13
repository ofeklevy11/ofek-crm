"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Table,
  CheckSquare,
  DollarSign,
  Bell,
  Settings2,
  X,
} from "lucide-react";

interface OnCompleteAction {
  actionType:
    | "UPDATE_RECORD"
    | "CREATE_TASK"
    | "UPDATE_TASK"
    | "CREATE_FINANCE"
    | "SEND_NOTIFICATION";
  config: Record<string, unknown>;
}

interface TaskItemAutomationsProps {
  actions: OnCompleteAction[];
  onChange: (actions: OnCompleteAction[]) => void;
  users: Array<{ id: number; name: string }>;
  tables: Array<{ id: number; name: string }>;
}

const actionTypes = [
  {
    value: "UPDATE_RECORD",
    label: "עדכון רשומה בטבלה",
    icon: Table,
    color: "text-blue-400",
  },
  {
    value: "CREATE_TASK",
    label: "יצירת משימה חדשה",
    icon: CheckSquare,
    color: "text-emerald-400",
  },
  {
    value: "UPDATE_TASK",
    label: "עדכון משימה קיימת",
    icon: Settings2,
    color: "text-purple-400",
  },
  {
    value: "CREATE_FINANCE",
    label: "יצירת רשומת פיננסים",
    icon: DollarSign,
    color: "text-yellow-400",
  },
  {
    value: "SEND_NOTIFICATION",
    label: "שליחת התראה",
    icon: Bell,
    color: "text-orange-400",
  },
];

export default function TaskItemAutomations({
  actions,
  onChange,
  users,
  tables,
}: TaskItemAutomationsProps) {
  const [isExpanded, setIsExpanded] = useState(actions.length > 0);

  const addAction = () => {
    onChange([
      ...actions,
      {
        actionType: "SEND_NOTIFICATION",
        config: {},
      },
    ]);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<OnCompleteAction>) => {
    onChange(
      actions.map((action, i) =>
        i === index ? { ...action, ...updates } : action
      )
    );
  };

  const updateConfig = (index: number, key: string, value: unknown) => {
    const newConfig = { ...actions[index].config, [key]: value };
    updateAction(index, { config: newConfig });
  };

  return (
    <div className="border border-slate-600 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">
            אוטומציות בהשלמה
          </span>
          {actions.length > 0 && (
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
              {actions.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3 bg-slate-900/30">
          {actions.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-2">
              אין אוטומציות מוגדרות. הוסף פעולה שתרוץ כשהפריט יסומן כמושלם.
            </p>
          ) : (
            actions.map((action, index) => (
              <ActionCard
                key={index}
                action={action}
                index={index}
                onUpdate={(updates) => updateAction(index, updates)}
                onUpdateConfig={(key, value) => updateConfig(index, key, value)}
                onRemove={() => removeAction(index)}
                users={users}
                tables={tables}
              />
            ))
          )}

          <button
            type="button"
            onClick={addAction}
            className="w-full flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300 py-2 border border-dashed border-slate-600 rounded-lg hover:border-blue-500/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף פעולה
          </button>
        </div>
      )}
    </div>
  );
}

interface ActionCardProps {
  action: OnCompleteAction;
  index: number;
  onUpdate: (updates: Partial<OnCompleteAction>) => void;
  onUpdateConfig: (key: string, value: unknown) => void;
  onRemove: () => void;
  users: Array<{ id: number; name: string }>;
  tables: Array<{ id: number; name: string }>;
}

function ActionCard({
  action,
  index,
  onUpdate,
  onUpdateConfig,
  onRemove,
  users,
  tables,
}: ActionCardProps) {
  const actionTypeInfo = actionTypes.find((t) => t.value === action.actionType);
  const Icon = actionTypeInfo?.icon || Settings2;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${actionTypeInfo?.color}`} />
          <select
            value={action.actionType}
            onChange={(e) =>
              onUpdate({
                actionType: e.target.value as OnCompleteAction["actionType"],
                config: {},
              })
            }
            className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {actionTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Config fields based on action type */}
      <div className="space-y-2">
        {action.actionType === "SEND_NOTIFICATION" && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">נמען</label>
              <select
                value={(action.config.recipientId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("recipientId", parseInt(e.target.value))
                }
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">בחר נמען...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                כותרת ההתראה
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder='לדוגמה: "משימה הושלמה"'
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                תוכן ההתראה
              </label>
              <input
                type="text"
                value={(action.config.message as string) || ""}
                onChange={(e) => onUpdateConfig("message", e.target.value)}
                placeholder="השתמש ב-{itemTitle}, {sheetTitle}, {userName}"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {action.actionType === "CREATE_TASK" && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                כותרת המשימה *
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder="שם המשימה החדשה"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">תיאור</label>
              <input
                type="text"
                value={(action.config.description as string) || ""}
                onChange={(e) => onUpdateConfig("description", e.target.value)}
                placeholder="תיאור המשימה"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  סטטוס
                </label>
                <select
                  value={(action.config.status as string) || "todo"}
                  onChange={(e) => onUpdateConfig("status", e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="todo">לביצוע</option>
                  <option value="in_progress">בטיפול</option>
                  <option value="waiting_client">ממתין ללקוח</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  עדיפות
                </label>
                <select
                  value={(action.config.priority as string) || ""}
                  onChange={(e) => onUpdateConfig("priority", e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ללא</option>
                  <option value="low">נמוכה</option>
                  <option value="medium">בינונית</option>
                  <option value="high">גבוהה</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                הקצה ל-
              </label>
              <select
                value={(action.config.assigneeId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig(
                    "assigneeId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ללא הקצאה</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {action.actionType === "UPDATE_TASK" && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                מזהה המשימה (Task ID)
              </label>
              <input
                type="text"
                value={(action.config.taskId as string) || ""}
                onChange={(e) => onUpdateConfig("taskId", e.target.value)}
                placeholder="ID של המשימה לעדכון"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                סטטוס חדש
              </label>
              <select
                value={
                  ((action.config.updates as Record<string, unknown>)
                    ?.status as string) || ""
                }
                onChange={(e) =>
                  onUpdateConfig("updates", {
                    ...(action.config.updates as Record<string, unknown>),
                    status: e.target.value || undefined,
                  })
                }
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ללא שינוי</option>
                <option value="todo">לביצוע</option>
                <option value="in_progress">בטיפול</option>
                <option value="waiting_client">ממתין ללקוח</option>
                <option value="completed_month">בוצע</option>
              </select>
            </div>
          </>
        )}

        {action.actionType === "CREATE_FINANCE" && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                כותרת *
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder="שם הרשומה"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  סכום *
                </label>
                <input
                  type="number"
                  value={(action.config.amount as number) || ""}
                  onChange={(e) =>
                    onUpdateConfig("amount", parseFloat(e.target.value))
                  }
                  placeholder="0.00"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  סוג *
                </label>
                <select
                  value={(action.config.type as string) || "INCOME"}
                  onChange={(e) => onUpdateConfig("type", e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="INCOME">הכנסה</option>
                  <option value="EXPENSE">הוצאה</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                קטגוריה
              </label>
              <input
                type="text"
                value={(action.config.category as string) || ""}
                onChange={(e) => onUpdateConfig("category", e.target.value)}
                placeholder='לדוגמה: "מכירות"'
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {action.actionType === "UPDATE_RECORD" && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">טבלה</label>
              <select
                value={(action.config.tableId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("tableId", parseInt(e.target.value))
                }
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">בחר טבלה...</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                מזהה רשומה (Record ID)
              </label>
              <input
                type="number"
                value={(action.config.recordId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("recordId", parseInt(e.target.value))
                }
                placeholder="ID של הרשומה"
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                עדכונים (JSON)
              </label>
              <textarea
                value={JSON.stringify(action.config.updates || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const updates = JSON.parse(e.target.value);
                    onUpdateConfig("updates", updates);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                placeholder='{"fieldKey": "newValue"}'
                className="w-full bg-slate-900/50 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                rows={3}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
