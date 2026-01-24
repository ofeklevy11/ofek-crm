"use client";

import { useState, useEffect } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import {
  X,
  Loader2,
  ListTodo,
  TableProperties,
  Clock,
  ArrowRight,
  ArrowLeft,
  Bell,
  Timer,
  CheckCircle2,
  MousePointer2,
  CalendarClock,
  ChevronDown,
} from "lucide-react";

interface User {
  id: number;
  name: string;
}

interface AutomationModalProps {
  users: User[];
  tables: { id: number; name: string }[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
  editingRule?: {
    id: number;
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  } | null;
}

export default function AutomationModal({
  users,
  tables,
  currentUserId,
  onClose,
  onCreated,
  editingRule,
}: AutomationModalProps) {
  // --- Wizard State ---
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // --- Form State ---
  const [name, setName] = useState(editingRule?.name || "");
  const [triggerType, setTriggerType] = useState<
    | "TASK_STATUS_CHANGE"
    | "NEW_RECORD"
    | "RECORD_FIELD_CHANGE"
    | "TIME_SINCE_CREATION"
  >((editingRule?.triggerType as any) || "RECORD_FIELD_CHANGE");

  // Task specific
  const [toStatus, setToStatus] = useState(
    editingRule?.triggerConfig?.toStatus || "any",
  );

  // Generic Record specific
  const [tableId, setTableId] = useState(
    editingRule?.triggerConfig?.tableId || "",
  );
  const [columnId, setColumnId] = useState(
    editingRule?.triggerConfig?.columnId || "",
  );
  const [fromValue, setFromValue] = useState(
    editingRule?.triggerConfig?.fromValue || "",
  );
  const [toValue, setToValue] = useState(
    editingRule?.triggerConfig?.toValue || "",
  );

  // Time Based Trigger specific
  const [timeValue, setTimeValue] = useState(
    editingRule?.triggerConfig?.timeValue || "",
  );
  const [timeUnit, setTimeUnit] = useState(
    editingRule?.triggerConfig?.timeUnit || "hours",
  );
  const [conditionColumnId, setConditionColumnId] = useState(
    editingRule?.triggerConfig?.conditionColumnId || "",
  );
  const [conditionValue, setConditionValue] = useState(
    editingRule?.triggerConfig?.conditionValue || "",
  );

  const [columns, setColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Fetch columns when table/trigger changes
  useEffect(() => {
    if (
      tableId &&
      (triggerType === "RECORD_FIELD_CHANGE" ||
        triggerType === "TIME_SINCE_CREATION")
    ) {
      setLoadingColumns(true);
      getTableById(Number(tableId))
        .then((res) => {
          if (res.success && res.data && res.data.schemaJson) {
            const schema = res.data.schemaJson as any;
            if (Array.isArray(schema)) {
              setColumns(schema);
            } else if (schema && Array.isArray(schema.columns)) {
              setColumns(schema.columns);
            } else {
              setColumns([]);
            }
          }
        })
        .finally(() => setLoadingColumns(false));
    } else {
      setColumns([]);
    }
  }, [tableId, triggerType]);

  const [recipientId, setRecipientId] = useState(
    editingRule?.actionConfig?.recipientId?.toString() || "",
  );
  const [messageTemplate, setMessageTemplate] = useState(
    editingRule?.actionConfig?.messageTemplate ||
      "המשימה {taskTitle} עברה לסטטוס {toStatus}",
  );
  const [loading, setLoading] = useState(false);

  const [actionType, setActionType] = useState<
    "SEND_NOTIFICATION" | "CALCULATE_DURATION"
  >((editingRule?.actionType as any) || "SEND_NOTIFICATION");

  // Advanced Conditions State
  const [useBusinessHours, setUseBusinessHours] = useState(
    !!editingRule?.triggerConfig?.businessHours,
  );
  const [activeDays, setActiveDays] = useState<number[]>(
    editingRule?.triggerConfig?.businessHours?.days || [0, 1, 2, 3, 4],
  );
  const [startTime, setStartTime] = useState(
    editingRule?.triggerConfig?.businessHours?.start || "09:00",
  );
  const [endTime, setEndTime] = useState(
    editingRule?.triggerConfig?.businessHours?.end || "17:00",
  );

  // --- Logic Helpers ---

  const selectedColumn = columns.find(
    (c) => c.id === columnId || c.name === columnId,
  );
  const isSelectColumn =
    selectedColumn &&
    (selectedColumn.type === "select" || selectedColumn.type === "multiSelect");

  const selectedConditionColumn = columns.find(
    (c) => c.id === conditionColumnId || c.name === conditionColumnId,
  );
  const isSelectConditionColumn =
    selectedConditionColumn &&
    (selectedConditionColumn.type === "select" ||
      selectedConditionColumn.type === "multiSelect" ||
      selectedConditionColumn.type === "status");

  // --- Submission ---
  const handleSubmit = async () => {
    setLoading(true);

    try {
      let triggerConfig: any = {};

      if (triggerType === "TASK_STATUS_CHANGE") {
        triggerConfig = { toStatus: toStatus === "any" ? undefined : toStatus };
      } else if (triggerType === "NEW_RECORD") {
        triggerConfig = { tableId };
      } else if (triggerType === "RECORD_FIELD_CHANGE") {
        triggerConfig = {
          tableId,
          columnId,
          fromValue: fromValue || undefined,
          toValue: toValue || undefined,
        };
      } else if (triggerType === "TIME_SINCE_CREATION") {
        triggerConfig = {
          tableId,
          timeValue: Number(timeValue),
          timeUnit,
          conditionColumnId,
          conditionValue,
        };
      }

      if (useBusinessHours) {
        triggerConfig.businessHours = {
          days: activeDays,
          start: startTime,
          end: endTime,
        };
      }

      const data = {
        name,
        triggerType,
        triggerConfig,
        actionType,
        actionConfig:
          actionType === "SEND_NOTIFICATION"
            ? {
                recipientId: parseInt(recipientId),
                messageTemplate,
                titleTemplate: "עדכון במערכת",
              }
            : {},
      };

      let result;
      if (editingRule) {
        result = await updateAutomationRule(editingRule.id, data);
      } else {
        result = await createAutomationRule(data);
      }

      if (result.success) {
        onCreated();
        onClose();
      } else {
        alert("Failed to save automation");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving automation");
    } finally {
      setLoading(false);
    }
  };

  // --- Validation ---
  const canProceedToStep2 = name.length > 2;
  const canProceedToStep3 = () => {
    if (triggerType === "NEW_RECORD") return !!tableId;
    if (triggerType === "TASK_STATUS_CHANGE") return true;
    if (triggerType === "RECORD_FIELD_CHANGE") return !!tableId && !!columnId;
    if (triggerType === "TIME_SINCE_CREATION") return !!tableId && !!timeValue;
    return false;
  };
  const canSubmit = () => {
    if (actionType === "SEND_NOTIFICATION")
      return !!recipientId && !!messageTemplate;
    return true;
  };

  // --- Steps Components ---

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          איך נקרא לאוטומציה הזו?
        </label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="לדוגמה: התראה על ליד חדש"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          מה יפעיל את האוטומציה?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TriggerCard
            title="שינוי סטטוס משימה"
            description="כאשר משימה עוברת לסטטוס מסוים"
            icon={<ListTodo className="text-blue-500" size={24} />}
            selected={triggerType === "TASK_STATUS_CHANGE"}
            onClick={() => {
              setTriggerType("TASK_STATUS_CHANGE");
              setMessageTemplate("המשימה {taskTitle} עברה לסטטוס {toStatus}");
            }}
          />
          <TriggerCard
            title="רשומה חדשה"
            description="כאשר נוספת רשומה חדשה לטבלה"
            icon={<TableProperties className="text-green-500" size={24} />}
            selected={triggerType === "NEW_RECORD"}
            onClick={() => {
              setTriggerType("NEW_RECORD");
              setMessageTemplate("נוצרה רשומה חדשה בטבלה {tableName}");
            }}
          />
          <TriggerCard
            title="שינוי ערך בטבלה"
            description="כאשר עמודה ספציפית משתנה"
            icon={<MousePointer2 className="text-purple-500" size={24} />}
            selected={triggerType === "RECORD_FIELD_CHANGE"}
            onClick={() => {
              setTriggerType("RECORD_FIELD_CHANGE");
              setMessageTemplate(
                "שדה {fieldName} שונה מ-{fromValue} ל-{toValue}",
              );
            }}
          />
          <TriggerCard
            title="זמן מאז יצירה"
            description="טריגר מבוסס זמן (למשל: שעתיים אחרי יצירה)"
            icon={<Clock className="text-orange-500" size={24} />}
            selected={triggerType === "TIME_SINCE_CREATION"}
            onClick={() => {
              setTriggerType("TIME_SINCE_CREATION");
              setMessageTemplate("חלף זמן מאז יצירת הרשומה בטבלה {tableName}");
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm text-gray-600 flex items-center gap-2">
        {triggerType === "TASK_STATUS_CHANGE" && <ListTodo size={16} />}
        {triggerType === "NEW_RECORD" && <TableProperties size={16} />}
        {triggerType === "RECORD_FIELD_CHANGE" && <MousePointer2 size={16} />}
        {triggerType === "TIME_SINCE_CREATION" && <Clock size={16} />}
        <span>
          מגדיר תנאים עבור:
          <span className="font-semibold mx-1">
            {triggerType === "TASK_STATUS_CHANGE" && "שינוי סטטוס משימה"}
            {triggerType === "NEW_RECORD" && "רשומה חדשה"}
            {triggerType === "RECORD_FIELD_CHANGE" && "שינוי שדה"}
            {triggerType === "TIME_SINCE_CREATION" && "זמן מאז יצירה"}
          </span>
        </span>
      </div>

      {/* Common Table Selector */}
      {(triggerType === "NEW_RECORD" ||
        triggerType === "RECORD_FIELD_CHANGE" ||
        triggerType === "TIME_SINCE_CREATION") && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            בחר טבלה
          </label>
          <select
            required
            value={tableId}
            autoFocus
            onChange={(e) => setTableId(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">בחר מרשימה...</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Task Specific */}
      {triggerType === "TASK_STATUS_CHANGE" && (
        <div className="p-4 border rounded-lg bg-blue-50 border-blue-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            מתי להפעיל?
          </label>
          <select
            value={toStatus}
            onChange={(e) => setToStatus(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
          >
            <option value="any">כאשר עובר לכל סטטוס שהוא</option>
            <option value="todo">כאשר עובר ל-לביצוע</option>
            <option value="in_progress">כאשר עובר ל-בטיפול</option>
            <option value="waiting_client">כאשר עובר ל-ממתין ללקוח</option>
            <option value="completed_month">כאשר עובר ל-בוצע</option>
          </select>
        </div>
      )}

      {/* Field Change Specific */}
      {triggerType === "RECORD_FIELD_CHANGE" && tableId && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              איזו עמודה לנטר?
            </label>
            {loadingColumns ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 p-2">
                <Loader2 className="animate-spin" size={16} /> טוען עמודות...
              </div>
            ) : (
              <select
                required
                value={columnId}
                onChange={(e) => {
                  setColumnId(e.target.value);
                  setFromValue("");
                  setToValue("");
                }}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">בחר עמודה...</option>
                {columns.map((col: any) => (
                  <option key={col.id || col.name} value={col.name}>
                    {col.label || col.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedColumn && (
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ערך מקור (אופציונלי)
                </label>
                {isSelectColumn ? (
                  <select
                    value={fromValue}
                    onChange={(e) => setFromValue(e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded text-sm"
                  >
                    <option value="">הכל</option>
                    {selectedColumn.options?.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={fromValue}
                    onChange={(e) => setFromValue(e.target.value)}
                    placeholder="הכל"
                    className="w-full px-3 py-2 bg-white border rounded text-sm"
                  />
                )}
              </div>
              <div className="flex items-center justify-center pt-5">
                <ArrowLeft className="text-gray-400" size={20} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ערך חדש (אופציונלי)
                </label>
                {isSelectColumn ? (
                  <select
                    value={toValue}
                    onChange={(e) => setToValue(e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded text-sm"
                  >
                    <option value="">הכל</option>
                    {selectedColumn.options?.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={toValue}
                    onChange={(e) => setToValue(e.target.value)}
                    placeholder="הכל"
                    className="w-full px-3 py-2 bg-white border rounded text-sm"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time Specific */}
      {triggerType === "TIME_SINCE_CREATION" && tableId && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex gap-4 items-end bg-orange-50 p-4 rounded-lg border border-orange-100">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                כמות
              </label>
              <input
                type="number"
                min="1"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="1"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                יחידה
              </label>
              <select
                value={timeUnit}
                onChange={(e) => setTimeUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="hours">שעות</option>
                <option value="days">ימים</option>
                <option value="minutes">דקות</option>
              </select>
            </div>
            <div className="mb-2 text-gray-500 font-medium">לאחר היצירה</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800 flex gap-2 items-start">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>שים לב:</strong> האוטומציה הזו תפעל רק על רשומות שייווצרו
              לאחר יצירת אוטומציה זו. רשומות היסטוריות לא ייחשבו.
            </span>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              תנאי נוסף (רק אם...)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={conditionColumnId}
                onChange={(e) => setConditionColumnId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">תמיד (ללא תנאי)</option>
                {columns.map((col: any) => (
                  <option key={col.id || col.name} value={col.name}>
                    {col.label || col.name}
                  </option>
                ))}
              </select>

              {conditionColumnId &&
                (isSelectConditionColumn ? (
                  <select
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">בחר ערך...</option>
                    {selectedConditionColumn?.options?.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder="ערך שווה ל..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        איזו פעולה לבצע?
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <TriggerCard
          title="שליחת התראה"
          description="שלח הודעה למערכת"
          icon={<Bell className="text-yellow-500" size={24} />}
          selected={actionType === "SEND_NOTIFICATION"}
          onClick={() => setActionType("SEND_NOTIFICATION")}
        />
        <TriggerCard
          title="חישוב זמן"
          description="חשב ושמור את זמן השהייה בסטטוס"
          icon={<Timer className="text-teal-500" size={24} />}
          selected={actionType === "CALCULATE_DURATION"}
          onClick={() => setActionType("CALCULATE_DURATION")}
        />
      </div>

      {actionType === "SEND_NOTIFICATION" && (
        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              למי לשלוח?
            </label>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
            >
              <option value="">בחר משתמש...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              הודעה
            </label>
            <textarea
              required
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              טיפ: השתמש ב- {"{tableName}"} או {"{fieldName}"} כדי להוסיף מידע
              דינמי.
            </p>
          </div>
        </div>
      )}

      {actionType === "CALCULATE_DURATION" && (
        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-sm text-teal-800">
          <p className="font-semibold mb-1">איך זה עובד?</p>
          המערכת תחשב אוטומטית את הזמן שעבר בין השינוי האחרון לשינוי הנוכחי
          ותשמור אותו בדוח ביצועים. אין צורך בהגדרות נוספות.
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <label className="block text-lg font-medium text-gray-800 mb-2">
        תנאים מתקדמים ומגבלות
      </label>
      <p className="text-sm text-gray-500 mb-6">
        הגדר מתי האוטומציה הזו מורשית לפעול. במידה והתנאים לא מתקיימים,
        האוטומציה תדולג.
      </p>

      <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="useBusinessHours"
            checked={useBusinessHours}
            onChange={(e) => setUseBusinessHours(e.target.checked)}
            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          />
          <label
            htmlFor="useBusinessHours"
            className="text-base font-medium text-gray-800 select-none cursor-pointer"
          >
            הגבלת פעילות לימים ושעות מסוימים בלבד
          </label>
        </div>

        {useBusinessHours && (
          <div className="space-y-6 pr-8 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">
                ימי פעילות
              </label>
              <div className="flex gap-3 flex-wrap">
                {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((day, idx) => {
                  const isActive = activeDays.includes(idx);
                  // Adjust index so 0=Sunday
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setActiveDays(activeDays.filter((d) => d !== idx));
                        } else {
                          setActiveDays([...activeDays, idx].sort());
                        }
                      }}
                      className={`w-10 h-10 rounded-full text-base font-bold transition-all shadow-sm ${
                        isActive
                          ? "bg-purple-600 text-white shadow-purple-200 scale-110 ring-2 ring-purple-100"
                          : "bg-white text-gray-500 border border-gray-200 hover:border-purple-300 hover:text-purple-600"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  משעה
                </label>
                <div className="relative">
                  <Clock
                    className="absolute top-3 right-3 text-gray-400"
                    size={16}
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  עד שעה
                </label>
                <div className="relative">
                  <Clock
                    className="absolute top-3 right-3 text-gray-400"
                    size={16}
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/50 p-3 rounded-lg border border-purple-100 text-xs text-purple-800 flex items-start gap-2">
              <CalendarClock size={16} className="shrink-0 mt-0.5" />
              שים לב: במידה ומוגדרים ימי פעילות, האוטומציה לא תפעל כלל מחוץ
              לטווחים האלו, גם אם הטריגר התרחש.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gray-50 px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-800">
              {editingRule ? "עריכת אוטומציה" : "אשף האוטומציות"}
            </h3>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-8 bg-blue-600" : "w-2 bg-gray-200"}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              {renderStep1()}
            </div>
          )}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-white flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowRight size={18} />
              חזור
            </button>
          ) : (
            <div /> // Spacer
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !canProceedToStep2) ||
                (step === 2 && !canProceedToStep3()) ||
                (step === 3 && !canSubmit())
              }
              className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              המשך לשלב הבא
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-lg shadow-green-200 flex items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              {editingRule ? "שמור שינויים" : "צור אוטומציה"}
              <CheckCircle2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TriggerCard({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${
        selected
          ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-2"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-lg ${selected ? "bg-white" : "bg-gray-100 group-hover:bg-white"} transition-colors`}
        >
          {icon}
        </div>
        <div>
          <h4
            className={`font-bold text-lg mb-1 ${selected ? "text-blue-900" : "text-gray-800"}`}
          >
            {title}
          </h4>
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-4 left-4 text-blue-500">
          <CheckCircle2
            size={20}
            fill="currentColor"
            className="text-blue-100"
          />
        </div>
      )}
    </div>
  );
}
