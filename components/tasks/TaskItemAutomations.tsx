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
  Globe,
  MessageCircle,
  Calendar,
} from "lucide-react";

interface OnCompleteAction {
  actionType:
    | "UPDATE_RECORD"
    | "CREATE_TASK"
    | "UPDATE_TASK"
    | "CREATE_FINANCE"
    | "SEND_NOTIFICATION"
    | "SEND_WEBHOOK"
    | "SEND_WHATSAPP"
    | "CREATE_CALENDAR_EVENT";
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
    color: "text-blue-600",
  },
  {
    value: "CREATE_TASK",
    label: "יצירת משימה חדשה",
    icon: CheckSquare,
    color: "text-emerald-600",
  },
  {
    value: "UPDATE_TASK",
    label: "עדכון משימה קיימת",
    icon: Settings2,
    color: "text-purple-600",
  },
  {
    value: "CREATE_FINANCE",
    label: "יצירת רשומת פיננסים",
    icon: DollarSign,
    color: "text-yellow-600",
  },
  {
    value: "SEND_NOTIFICATION",
    label: "שליחת התראה",
    icon: Bell,
    color: "text-orange-600",
  },
  {
    value: "SEND_WEBHOOK",
    label: "שליחת Webhook",
    icon: Globe,
    color: "text-cyan-600",
  },
  {
    label: "שליחת הודעת וואטספ",
    icon: MessageCircle,
    color: "text-green-600",
  },
  {
    value: "CREATE_CALENDAR_EVENT",
    label: "יצירת אירוע ביומן",
    icon: Calendar,
    color: "text-pink-600",
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
        i === index ? { ...action, ...updates } : action,
      ),
    );
  };

  const updateConfig = (index: number, key: string, value: unknown) => {
    const newConfig = { ...actions[index].config, [key]: value };
    updateAction(index, { config: newConfig });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">
            אוטומציות בהשלמה
          </span>
          {actions.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
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
          {actions.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-4 bg-white rounded-lg border border-dashed border-gray-300">
              לא הוגדרו אוטומציות. הוסף פעולה שתרוץ בעת השלמת השלב.
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
            className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium py-2.5 border border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            הוסף פעולה חדשה
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
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-lg bg-gray-50 ${actionTypeInfo?.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <select
            value={action.actionType}
            onChange={(e) =>
              onUpdate({
                actionType: e.target.value as OnCompleteAction["actionType"],
                config: {},
              })
            }
            className="bg-transparent font-medium text-gray-900 border-none focus:ring-0 cursor-pointer text-sm"
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
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="מחק אוטומציה"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 pl-11">
        {action.actionType === "SEND_NOTIFICATION" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                נמען
              </label>
              <select
                value={(action.config.recipientId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("recipientId", parseInt(e.target.value))
                }
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                כותרת ההתראה
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder='לדוגמה: "משימה הושלמה"'
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                תוכן ההתראה
              </label>
              <input
                type="text"
                value={(action.config.message as string) || ""}
                onChange={(e) => onUpdateConfig("message", e.target.value)}
                placeholder="השתמש ב-{itemTitle}, {sheetTitle}, {userName}"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </>
        )}

        {action.actionType === "SEND_WHATSAPP" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                מספר טלפון או מזהה קבוצה
              </label>
              <input
                type="text"
                value={(action.config.phone as string) || ""}
                onChange={(e) => onUpdateConfig("phone", e.target.value)}
                placeholder="0501234567 או 123456@g.us"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dir-ltr"
              />
              {/* Preview Logic */}
              {(action.config.phone as string) && (
                <div className="mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">
                    תצוגה מקדימה למערכת (Preview)
                  </div>
                  <div className="text-xs font-mono text-green-600 dir-ltr font-medium">
                    {(() => {
                      const input = (action.config.phone as string) || "";
                      let clean = input.trim();
                      if (clean.endsWith("@g.us")) return clean;
                      clean = clean.replace(/\D/g, "");
                      if (clean.startsWith("0"))
                        clean = "972" + clean.substring(1);
                      if (clean && !clean.endsWith("@c.us")) clean += "@c.us";
                      return clean || "מספר לא תקין";
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                תוכן ההודעה
              </label>
              <textarea
                value={(action.config.message as string) || ""}
                onChange={(e) => onUpdateConfig("message", e.target.value)}
                placeholder="הקלד את הודעת הוואטספ שלך כאן..."
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                rows={3}
              />
              <p className="text-[10px] text-gray-500 mt-1.5">
                ניתן להשתמש ב-{"{itemTitle}"}, {"{sheetTitle}"}, {"{userName}"}
              </p>
            </div>
          </>
        )}

        {action.actionType === "SEND_WEBHOOK" && (
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              כתובת ה-Webhook (URL)
            </label>
            <input
              type="url"
              value={(action.config.url as string) || ""}
              onChange={(e) => onUpdateConfig("url", e.target.value)}
              placeholder="https://api.example.com/webhook"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dir-ltr"
            />
            <p className="text-[10px] text-gray-500 mt-1.5">
              אנו נשלח בקשת POST לכתובת זו עם כל פרטי המשימה והמשתמש המבצע.
            </p>
          </div>
        )}

        {action.actionType === "CREATE_TASK" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                כותרת המשימה *
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder="שם המשימה החדשה"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                תיאור
              </label>
              <input
                type="text"
                value={(action.config.description as string) || ""}
                onChange={(e) => onUpdateConfig("description", e.target.value)}
                placeholder="תיאור המשימה"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  סטטוס
                </label>
                <select
                  value={(action.config.status as string) || "todo"}
                  onChange={(e) => onUpdateConfig("status", e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="todo">לביצוע</option>
                  <option value="in_progress">בטיפול</option>
                  <option value="waiting_client">ממתין ללקוח</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  עדיפות
                </label>
                <select
                  value={(action.config.priority as string) || ""}
                  onChange={(e) => onUpdateConfig("priority", e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="">ללא</option>
                  <option value="low">נמוכה</option>
                  <option value="medium">בינונית</option>
                  <option value="high">גבוהה</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                הקצה ל-
              </label>
              <select
                value={(action.config.assigneeId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig(
                    "assigneeId",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                מזהה המשימה (Task ID)
              </label>
              <input
                type="text"
                value={(action.config.taskId as string) || ""}
                onChange={(e) => onUpdateConfig("taskId", e.target.value)}
                placeholder="ID של המשימה לעדכון"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
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
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                כותרת *
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder="שם הרשומה"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  סכום *
                </label>
                <input
                  type="number"
                  value={(action.config.amount as number) || ""}
                  onChange={(e) =>
                    onUpdateConfig("amount", parseFloat(e.target.value))
                  }
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  סוג *
                </label>
                <select
                  value={(action.config.type as string) || "INCOME"}
                  onChange={(e) => onUpdateConfig("type", e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="INCOME">הכנסה</option>
                  <option value="EXPENSE">הוצאה</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                קטגוריה
              </label>
              <input
                type="text"
                value={(action.config.category as string) || ""}
                onChange={(e) => onUpdateConfig("category", e.target.value)}
                placeholder='לדוגמה: "מכירות"'
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </>
        )}

        {action.actionType === "UPDATE_RECORD" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                טבלה
              </label>
              <select
                value={(action.config.tableId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("tableId", parseInt(e.target.value))
                }
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                מזהה רשומה (Record ID)
              </label>
              <input
                type="number"
                value={(action.config.recordId as number) || ""}
                onChange={(e) =>
                  onUpdateConfig("recordId", parseInt(e.target.value))
                }
                placeholder="ID של הרשומה"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
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
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono resize-none"
                rows={3}
              />
            </div>
          </>
        )}

        {action.actionType === "CREATE_CALENDAR_EVENT" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                כותרת האירוע *
              </label>
              <input
                type="text"
                value={(action.config.title as string) || ""}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                placeholder="פגישת היכרות"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                תיאור
              </label>
              <input
                type="text"
                value={(action.config.description as string) || ""}
                onChange={(e) => onUpdateConfig("description", e.target.value)}
                placeholder="פרטי האירוע..."
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  שעת התחלה
                </label>
                <input
                  type="datetime-local"
                  value={(action.config.startTime as string) || ""}
                  onChange={(e) => onUpdateConfig("startTime", e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  שעת סיום
                </label>
                <input
                  type="datetime-local"
                  value={(action.config.endTime as string) || ""}
                  onChange={(e) => onUpdateConfig("endTime", e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                צבע
              </label>
              <input
                type="color"
                value={(action.config.color as string) || "#3b82f6"}
                onChange={(e) => onUpdateConfig("color", e.target.value)}
                className="w-full h-10 p-1 bg-white border border-gray-200 rounded-lg cursor-pointer"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
