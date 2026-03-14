"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckSquare,
  Bell,
  Smartphone,
  User,
  Calendar as CalendarIcon,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  X,
  Webhook,
  Table as TableIcon,
  CalendarPlus,
} from "lucide-react";
import { getUsers } from "@/app/actions/users";
import { getTables } from "@/app/actions/tables";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { showAlert } from "@/hooks/use-modal";

interface EventAutomationBuilderProps {
  onSave: (data: {
    minutesBefore: number;
    actionType: string;
    actionConfig: any;
  }) => void;
  onCancel: () => void;
  eventId?: string;

  initialData?: any;
  userPlan?: string; // "basic", "premium", "super"
  globalCount?: number;
  specificCount?: number;
}

const AvailableVariables = () => (
  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-600">
    <p className="font-semibold mb-2 text-gray-700">משתנים זמינים לשימוש:</p>
    <ul className="grid grid-cols-1 gap-1">
      <li className="flex items-center gap-2">
        <code className="bg-gray-200 px-1 rounded font-mono text-gray-800 text-[10px]">{`{eventTitle}`}</code>
        <span>- כותרת האירוע</span>
      </li>
      <li className="flex items-center gap-2">
        <code className="bg-gray-200 px-1 rounded font-mono text-gray-800 text-[10px]">{`{eventStart}`}</code>
        <span>- שעת התחלת האירוע (תאריך ושעה)</span>
      </li>
      <li className="flex items-center gap-2">
        <code className="bg-gray-200 px-1 rounded font-mono text-gray-800 text-[10px]">{`{eventEnd}`}</code>
        <span>- שעת סיום האירוע</span>
      </li>
    </ul>
  </div>
);

export function EventAutomationBuilder({
  onSave,
  onCancel,
  initialData,
  userPlan = "basic",
  globalCount = 0,
  specificCount = 0,
}: EventAutomationBuilderProps) {
  const [step, setStep] = useState(1);
  const [users, setUsers] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);

  // -- Trigger State --
  const [timeValue, setTimeValue] = useState(30);
  const [timeUnit, setTimeUnit] = useState<"minutes" | "hours" | "days">(
    "minutes",
  );

  // -- Action State --
  const [actionType, setActionType] = useState<string | null>(null);

  // -- Config State --
  // Task
  const [taskTitle, setTaskTitle] = useState("משימה עבור {eventTitle}");
  const [taskDesc, setTaskDesc] = useState("האירוע מתחיל ב-{eventStart}");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  // Add Status State
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskDueDays, setTaskDueDays] = useState(0);

  // Notification
  const [notifMessage, setNotifMessage] = useState(
    "האירוע {eventTitle} מתחיל בתאריך ובשעה {eventStart}",
  );
  const [notifRecipient, setNotifRecipient] = useState("");

  // WhatsApp
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState(
    "שלום, תזכורת לאירוע {eventTitle} בשעה {eventStart}",
  );

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMethod, setWebhookMethod] = useState("POST");

  // Create Record
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [selectedTableSchema, setSelectedTableSchema] = useState<any>(null);
  const [recordFieldMappings, setRecordFieldMappings] = useState<
    { columnId: string; value: string }[]
  >([]);

  // Create Calendar Event
  const [newEventTitle, setNewEventTitle] = useState("אירוע חדש: {eventTitle}");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventStartOffset, setNewEventStartOffset] = useState(0);
  const [newEventStartUnit, setNewEventStartUnit] = useState<
    "minutes" | "hours" | "days"
  >("days");

  const [newEventDuration, setNewEventDuration] = useState(1);
  const [newEventDurationUnit, setNewEventDurationUnit] = useState<
    "minutes" | "hours"
  >("hours");

  // Lazy-load users when reaching step 3 (only if needed for selected action)
  useEffect(() => {
    if (step !== 3) return;
    const needsUsers =
      actionType === "CREATE_TASK" || actionType === "SEND_NOTIFICATION";
    if (needsUsers && users.length === 0) {
      getUsers().then((res) => {
        if (res.success && res.data) setUsers(res.data);
      });
    }
    const needsTables = actionType === "CREATE_RECORD";
    if (needsTables && tables.length === 0) {
      getTables().then((res) => {
        if (res.success && res.data) setTables(res.data);
      });
    }
  }, [step, actionType]);

  // Update schema when table changes
  useEffect(() => {
    if (selectedTableId && tables.length > 0) {
      const table = tables.find(
        (t) => String(t.id) === String(selectedTableId),
      );
      if (table && table.schemaJson) {
        setSelectedTableSchema(table.schemaJson);
      } else {
        setSelectedTableSchema(null);
      }
    } else {
      setSelectedTableSchema(null);
    }
  }, [selectedTableId, tables]);

  // Initialize from initialData if provided
  useEffect(() => {
    if (typeof onSave === "function" && initialData) {
      // We need to parse mins back to value/unit
      const mins = initialData.triggerConfig?.minutesBefore || 30;
      let val = mins;
      let unit: "minutes" | "hours" | "days" = "minutes";

      if (mins >= 1440 && mins % 1440 === 0) {
        val = mins / 1440;
        unit = "days";
      } else if (mins >= 60 && mins % 60 === 0) {
        val = mins / 60;
        unit = "hours";
      }

      setTimeValue(val);
      setTimeUnit(unit);

      setActionType(initialData.actionType);

      const config = initialData.actionConfig || {};

      if (initialData.actionType === "CREATE_TASK") {
        setTaskTitle(config.title || "");
        setTaskDesc(config.description || "");
        setTaskAssignee(config.assigneeId ? String(config.assigneeId) : "");
        setTaskPriority(config.priority || "medium");
        setTaskStatus(config.status || "todo");
        setTaskDueDays(config.dueDays || 0);
      } else if (initialData.actionType === "SEND_NOTIFICATION") {
        setNotifMessage(config.messageTemplate || "");
        setNotifRecipient(config.recipientId ? String(config.recipientId) : "");
      } else if (initialData.actionType === "SEND_WHATSAPP" || initialData.actionType === "SEND_SMS") {
        const phone = config.phoneColumnId?.startsWith("manual:")
          ? config.phoneColumnId.replace("manual:", "")
          : "";
        setWaPhone(phone);
        setWaMessage(config.content || "");
      } else if (initialData.actionType === "WEBHOOK") {
        setWebhookUrl(config.url || "");
        setWebhookMethod(config.method || "POST");
      } else if (initialData.actionType === "CREATE_RECORD") {
        setSelectedTableId(config.tableId ? String(config.tableId) : "");
        setRecordFieldMappings(config.fieldMappings || []);
      } else if (initialData.actionType === "CREATE_CALENDAR_EVENT") {
        setNewEventTitle(config.title || "");
        setNewEventDesc(config.description || "");
        setNewEventStartOffset(config.startOffset || 0);
        setNewEventStartUnit(config.startOffsetUnit || "days");
        setNewEventDuration(config.endOffset || 1);
        setNewEventDurationUnit(config.endOffsetUnit || "hours");
      }
    }
  }, [initialData]);

  const totalMinutes = (() => {
    if (timeUnit === "hours") return timeValue * 60;
    if (timeUnit === "days") return timeValue * 1440;
    return timeValue;
  })();

  const handleNext = () => {
    if (step === 1) {
      if (totalMinutes < 5) {
        showAlert("מינימום 5 דקות לפני האירוע");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (actionType) setStep(3);
    } else if (step === 3) {
      handleSave();
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  // Validation Error State
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    let validationError: string | null = null;

    // Validation
    if (actionType === "SEND_WHATSAPP" || actionType === "SEND_SMS") {
      if (!waPhone || waPhone.trim() === "") {
        validationError = "חובה להזין מספר טלפון או Group ID";
      } else if (!waMessage || waMessage.trim() === "") {
        validationError = actionType === "SEND_SMS" ? "חובה להזין תוכן הודעה להודעת ה-SMS" : "חובה להזין תוכן הודעה להודעת ה-WhatsApp";
      }
    } else if (actionType === "WEBHOOK") {
      if (!webhookUrl || webhookUrl.trim() === "") {
        validationError = "חובה להזין כתובת URL ל-Webhook";
      }
    } else if (actionType === "CREATE_TASK") {
      if (!taskTitle || taskTitle.trim() === "") {
        validationError = "חובה להזין כותרת למשימה";
      }
    } else if (actionType === "SEND_NOTIFICATION") {
      if (!notifRecipient) {
        validationError = "חובה לבחור משתמש לקבלת ההתראה";
      } else if (!notifMessage || notifMessage.trim() === "") {
        validationError = "חובה להזין תוכן להתראה";
      }
    } else if (actionType === "CREATE_RECORD") {
      if (!selectedTableId) {
        validationError = "חובה לבחור טבלה ליצירת הרשומה";
      }
    } else if (actionType === "CREATE_CALENDAR_EVENT") {
      if (!newEventTitle || newEventTitle.trim() === "") {
        validationError = "חובה להזין כותרת לאירוע";
      }
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    let config = {};
    if (actionType === "CREATE_TASK") {
      config = {
        title: taskTitle,
        description: taskDesc,
        assigneeId: taskAssignee ? Number(taskAssignee) : null,
        priority: taskPriority,
        status: taskStatus,
        dueDays: Number(taskDueDays),
      };
    } else if (actionType === "SEND_NOTIFICATION") {
      config = {
        messageTemplate: notifMessage,
        recipientId: notifRecipient ? Number(notifRecipient) : null,
      };
    } else if (actionType === "SEND_WHATSAPP" || actionType === "SEND_SMS") {
      config = {
        // We use a special prefix to indicate manual number if needed
        // But executeWhatsAppAction usually expects phoneColumnId.
        // We will pass it as "manual:NUMBER"
        phoneColumnId: waPhone ? `manual:${waPhone}` : "",
        content: waMessage,
        messageType: "private",
      };
    } else if (actionType === "WEBHOOK") {
      config = {
        url: webhookUrl,
        method: webhookMethod,
      };
    } else if (actionType === "CREATE_RECORD") {
      config = {
        tableId: selectedTableId,
        fieldMappings: recordFieldMappings,
      };
    } else if (actionType === "CREATE_CALENDAR_EVENT") {
      config = {
        title: newEventTitle,
        description: newEventDesc,
        startOffset: Number(newEventStartOffset),
        startOffsetUnit: newEventStartUnit,
        endOffset: Number(newEventDuration), // we call it endOffset in config usually, effectively duration
        endOffsetUnit: newEventDurationUnit,
        color: "#a24ec1", // Purple default
      };
    }

    onSave({
      minutesBefore: totalMinutes,
      actionType: actionType || "",
      actionConfig: config,
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 rounded-xl overflow-hidden border border-gray-200 shadow-inner">
      {/* Progress Header */}
      <div className="bg-white p-4 border-b flex justify-between items-center px-8">
        <span className="sr-only" aria-live="polite">
          שלב {step} מתוך 3: {step === 1 ? "תזמון" : step === 2 ? "פעולה" : "הגדרות"}
        </span>
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className="flex flex-col items-center relative z-10 w-20"
          >
            <div
              aria-current={step === s ? "step" : undefined}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${step >= s ? "bg-blue-600 text-white scale-110" : "bg-gray-200 text-gray-500"}`}
            >
              {s}
            </div>
            <div className="text-xs mt-1 font-medium text-gray-500">
              {s === 1 ? "תזמון" : s === 2 ? "פעולה" : "הגדרות"}
            </div>
          </div>
        ))}
        {/* Progress Line Background */}
        <div
          className="absolute top-8 right-12 left-12 h-0.5 bg-gray-200 z-0 hidden md:block"
          style={{ top: "34px" }}
          aria-hidden="true"
        >
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
        {/* Step 1: Timing */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
                מתי להפעיל את האוטומציה?
              </h3>
              <p className="text-sm md:text-base text-gray-500">
                בחר כמה זמן לפני תחילת האירוע הפעולה תקרה
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-lg mx-auto transform transition-all hover:shadow-md">
              {/* Disclaimer */}
              <div className="space-y-4 mb-6">
                <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2 border border-blue-100">
                  <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold">
                        סטטוס מנוי:{" "}
                        {userPlan === "super"
                          ? "Super (ללא הגבלה)"
                          : userPlan === "premium"
                            ? "Premium (עד 6 אוטומציות)"
                            : "Basic (עד 2 אוטומציות)"}
                      </p>
                      {userPlan !== "super" && (
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">
                          {globalCount + specificCount} מתוך{" "}
                          {userPlan === "premium" ? 6 : 2} בשימוש
                        </span>
                      )}
                    </div>
                    {userPlan === "super" ? (
                      <p>משתמשי Super נהנים מכמות בלתי מוגבלת של אוטומציות!</p>
                    ) : (
                      <>
                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div
                            className="w-full bg-blue-100 rounded-full h-2 overflow-hidden"
                            role="progressbar"
                            aria-label="שימוש באוטומציות"
                            aria-valuenow={globalCount + specificCount}
                            aria-valuemin={0}
                            aria-valuemax={userPlan === "premium" ? 6 : 2}
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                globalCount + specificCount >=
                                (userPlan === "premium" ? 6 : 2)
                                  ? "bg-red-500"
                                  : globalCount + specificCount >=
                                      (userPlan === "premium" ? 4 : 1)
                                    ? "bg-yellow-500"
                                    : "bg-blue-600"
                              }`}
                              style={{
                                width: `${Math.min(100, ((globalCount + specificCount) / (userPlan === "premium" ? 6 : 2)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <p className="mb-2 text-xs">
                          {userPlan === "premium"
                            ? "משתמשי Premium מוגבלים ל-6 פעולות אוטומציה לאירוע (כולל קבועות)."
                            : "משתמשים רגילים מוגבלים ל-2 פעולות אוטומציה לאירוע (כולל קבועות)."}
                        </p>
                        <div className="text-xs bg-white/50 p-2 rounded border border-blue-200">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                              <span>
                                {globalCount} אוטומציות קבועות (גלובליות)
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              <span>
                                {specificCount} אוטומציות ספציפיות לאירוע
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-blue-200 font-bold text-center">
                            סה"כ: {globalCount + specificCount} מתוך{" "}
                            {userPlan === "premium" ? 6 : 2}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2">
                  <AlertCircle aria-hidden="true" size={16} />
                  <span>
                    שימו לב: לא ניתן להגדיר אוטומציה פחות מ-5 דקות לפני האירוע
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-center">
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    aria-label="כמות זמן"
                    value={timeValue}
                    onChange={(e) =>
                      setTimeValue(Math.max(1, Number(e.target.value)))
                    }
                    className="w-24 md:w-32 text-center text-2xl md:text-4xl font-bold border-b-2 border-blue-500 focus:outline-none focus:border-blue-700 bg-transparent py-2"
                  />
                </div>
                <select
                  value={timeUnit}
                  aria-label="יחידת זמן"
                  onChange={(e) => setTimeUnit(e.target.value as any)}
                  className="text-base md:text-xl p-3 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-gray-100"
                >
                  <option value="minutes">דקות</option>
                  <option value="hours">שעות</option>
                  <option value="days">ימים</option>
                </select>
                <span className="text-lg md:text-2xl text-gray-400 font-light">
                  לפני
                </span>
              </div>

              <div className="mt-8 p-4 bg-blue-50 rounded-xl flex items-center gap-3 text-blue-700">
                <Clock aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
                <span className="text-sm md:text-base font-medium">
                  האוטומציה תופעל {timeValue}{" "}
                  {timeUnit === "minutes"
                    ? "דקות"
                    : timeUnit === "hours"
                      ? "שעות"
                      : "ימים"}{" "}
                  לפני מועד האירוע
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Action Selection */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-6 md:mb-8">
              <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
                מה לעשות?
              </h3>
              <p className="text-sm md:text-base text-gray-500">
                בחר את הפעולה שתרצה שתתבצע באופן אוטומטי
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                {
                  id: "CREATE_TASK",
                  title: "יצירת משימה",
                  icon: CheckSquare,
                  color: "text-green-600",
                  bg: "bg-green-50",
                  border: "hover:border-green-500",
                },
                {
                  id: "SEND_NOTIFICATION",
                  title: "שליחת התראה",
                  icon: Bell,
                  color: "text-yellow-600",
                  bg: "bg-yellow-50",
                  border: "hover:border-yellow-500",
                },
                {
                  id: "SEND_WHATSAPP",
                  title: "הודעת WhatsApp",
                  icon: WhatsAppIcon,
                  color: "text-green-600",
                  bg: "bg-green-50",
                  border: "hover:border-green-500",
                },
                {
                  id: "SEND_SMS",
                  title: "שליחת SMS",
                  icon: Smartphone,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  border: "hover:border-blue-500",
                },
                {
                  id: "WEBHOOK",
                  title: "שליחת Webhook",
                  icon: Webhook,
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  border: "hover:border-purple-500",
                },
                {
                  id: "CREATE_RECORD",
                  title: "צור רשומה בטבלה",
                  icon: TableIcon,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  border: "hover:border-blue-500",
                },
                {
                  id: "CREATE_CALENDAR_EVENT",
                  title: "צור אירוע ביומן",
                  icon: CalendarPlus,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  border: "hover:border-indigo-500",
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActionType(item.id)}
                  aria-pressed={actionType === item.id}
                  className={`relative p-6 rounded-2xl border-2 transition-all duration-300 text-right group h-48 flex flex-col items-center justify-center gap-4 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                                ${actionType === item.id ? `border-blue-500 ring-2 ring-blue-500 ring-offset-2 bg-white shadow-lg` : `border-transparent bg-white shadow hover:shadow-lg ${item.border}`}
                            `}
                >
                  <div
                    className={`p-4 rounded-full ${item.bg} ${item.color} transition-transform group-hover:scale-110 duration-300`}
                    aria-hidden="true"
                  >
                    <item.icon size={32} />
                  </div>
                  <span className="font-bold text-lg text-gray-700 group-hover:text-gray-900">
                    {item.title}
                  </span>

                  {actionType === item.id && (
                    <div className="absolute top-3 right-3 text-blue-500">
                      <CheckCircle2 aria-hidden="true" size={24} className="fill-blue-100" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Configuration */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-300">
            {/* Error Message */}
            {error && (
              <div role="alert" className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2 border border-red-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle aria-hidden="true" size={18} className="shrink-0" />
                <span className="font-medium text-sm">{error}</span>
              </div>
            )}

            {/* Task Config */}
            {actionType === "CREATE_TASK" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg text-green-700" aria-hidden="true">
                    <CheckSquare />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    הגדרת משימה חדשה
                  </h3>
                </div>

                <div>
                  <label htmlFor="taskTitle" className="block text-sm font-medium text-gray-700 mb-1">
                    כותרת המשימה
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="taskTitle"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      placeholder="לדוגמה: הכן חדר ישיבות"
                    />
                    <span className="absolute left-2 top-2 text-xs text-gray-400 bg-gray-100 px-1 rounded border">
                      {"{vars}"}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="taskDesc" className="block text-sm font-medium text-gray-700 mb-1">
                    תיאור המשימה
                  </label>
                  <textarea
                    id="taskDesc"
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="taskAssignee" className="block text-sm font-medium text-gray-700 mb-1">
                      למי להקצות?
                    </label>
                    <div className="relative">
                      <User aria-hidden="true" className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                      <select
                        id="taskAssignee"
                        value={taskAssignee}
                        onChange={(e) => setTaskAssignee(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">ללא הקצאה</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="taskPriority" className="block text-sm font-medium text-gray-700 mb-1">
                      עדיפות
                    </label>
                    <select
                      id="taskPriority"
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">נמוכה</option>
                      <option value="medium">רגילה</option>
                      <option value="high">גבוהה</option>
                      <option value="critical">קריטית</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="taskStatus" className="block text-sm font-medium text-gray-700 mb-1">
                      סטטוס
                    </label>
                    <select
                      id="taskStatus"
                      value={taskStatus}
                      onChange={(e) => setTaskStatus(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="todo">משימות</option>
                      <option value="in_progress">משימות בטיפול</option>
                      <option value="waiting_client">
                        ממתינים לאישור לקוח
                      </option>
                      <option value="on_hold">משימות בהשהייה</option>
                      <option value="completed_month">בוצעו החודש</option>
                      <option value="done">משימות שבוצעו</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                  <CalendarIcon aria-hidden="true" className="w-5 h-5 text-gray-500" />
                  <span className="text-sm">תאריך יעד:</span>
                  <input
                    type="number"
                    min="0"
                    aria-label="ימים לאחר האירוע"
                    value={taskDueDays}
                    onChange={(e) => setTaskDueDays(Number(e.target.value))}
                    className="w-16 text-center border rounded px-1"
                  />
                  <span className="text-sm text-gray-500">
                    ימים לאחר תאריך האירוע
                  </span>
                </div>

                <AvailableVariables />
              </div>
            )}

            {/* Notification Config */}
            {actionType === "SEND_NOTIFICATION" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700" aria-hidden="true">
                    <Bell />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    שליחת התראה למערכת
                  </h3>
                </div>

                <div>
                  <label htmlFor="notifRecipient" className="block text-sm font-medium text-gray-700 mb-1">
                    למי לשלוח?
                  </label>
                  <select
                    id="notifRecipient"
                    value={notifRecipient}
                    onChange={(e) => setNotifRecipient(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">בחר משתמש...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  {!notifRecipient && (
                    <p className="text-xs text-red-500 mt-1">
                      חובה לבחור משתמש
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="notifMessage" className="block text-sm font-medium text-gray-700 mb-1">
                    תוכן ההודעה
                  </label>
                  <textarea
                    id="notifMessage"
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    ניתן להשתמש במשתנים דינמיים כדי להתאים אישית את ההודעה.
                  </p>
                  <AvailableVariables />
                </div>
              </div>
            )}

            {/* WhatsApp / SMS Config */}
            {(actionType === "SEND_WHATSAPP" || actionType === "SEND_SMS") && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5 relative overflow-hidden">
                {actionType === "SEND_WHATSAPP" && (
                  <div className="absolute top-0 left-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-br-lg font-bold tracking-wider">
                    POWERED BY GREEN-API
                  </div>
                )}

                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  {actionType === "SEND_SMS" ? (
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-700" aria-hidden="true">
                      <Smartphone className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="p-2 bg-green-100 rounded-lg text-green-700" aria-hidden="true">
                      <WhatsAppIcon />
                    </div>
                  )}
                  <h3 className="text-lg md:text-xl font-bold text-gray-800">
                    {actionType === "SEND_SMS" ? "הודעת SMS" : "הודעת WhatsApp"}
                  </h3>
                </div>

                <div>
                  <label htmlFor="waPhone" className="block text-sm font-medium text-gray-700 mb-1">
                    מספר טלפון (בינלאומי)
                  </label>
                  <div className="relative" dir="ltr">
                    <input
                      type="text"
                      id="waPhone"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-left"
                      placeholder="+972501234567"
                    />
                    <div className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" aria-hidden="true">
                      {actionType === "SEND_SMS" ? <Smartphone size={16} /> : <WhatsAppIcon size={16} />}
                    </div>
                  </div>
                  <p
                    className="text-xs text-gray-400 mt-1 text-right"
                    dir="rtl"
                  >
                    הזן מספר מלא כולל קידומת מדינה (לדוגמה: 97250...)
                  </p>
                </div>

                <div>
                  <label htmlFor="waMessage" className="block text-sm font-medium text-gray-700 mb-1">
                    תוכן ההודעה
                  </label>
                  <div className="relative">
                    <textarea
                      id="waMessage"
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      rows={5}
                      className={actionType === "SEND_SMS"
                        ? "w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-800"
                        : "w-full px-4 py-3 bg-[#e6f7ee] border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-800"
                      }
                    />
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      <span
                        className={actionType === "SEND_SMS"
                          ? "text-[10px] bg-white/50 px-1 rounded text-blue-800 border border-blue-200 cursor-help"
                          : "text-[10px] bg-white/50 px-1 rounded text-green-800 border border-green-200 cursor-help"
                        }
                        title="שם האירוע"
                      >
                        {"{eventTitle}"}
                      </span>
                      <span
                        className={actionType === "SEND_SMS"
                          ? "text-[10px] bg-white/50 px-1 rounded text-blue-800 border border-blue-200 cursor-help"
                          : "text-[10px] bg-white/50 px-1 rounded text-green-800 border border-green-200 cursor-help"
                        }
                        title="שעת התחלה"
                      >
                        {"{eventStart}"}
                      </span>
                    </div>
                  </div>
                  <AvailableVariables />
                </div>

                <div className="bg-blue-50 p-3 rounded-lg flex gap-2 items-start text-xs text-blue-700">
                  <AlertCircle aria-hidden="true" size={14} className="mt-0.5 flex-shrink-0" />
                  <p>
                    {actionType === "SEND_SMS"
                      ? "שים לב: ההודעה תישלח כ-SMS דרך Twilio. וודא שהמספר תקין."
                      : "שים לב: ההודעה תישלח דרך החשבון המחובר ל-Green API. וודא שהמספר תקין."}
                  </p>
                </div>
              </div>
            )}

            {/* Webhook Config */}
            {actionType === "WEBHOOK" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-700" aria-hidden="true">
                    <Webhook />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    הגדרת Webhook
                  </h3>
                </div>

                <div>
                  <label htmlFor="webhookUrl" className="block text-sm font-medium text-gray-700 mb-1">
                    כתובת URL
                  </label>
                  <input
                    type="text"
                    id="webhookUrl"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-left"
                    dir="ltr"
                    placeholder="https://api.example.com/webhook"
                  />
                </div>

                <div>
                  <label htmlFor="webhookMethod" className="block text-sm font-medium text-gray-700 mb-1">
                    שיטת שליחה (Method)
                  </label>
                  <select
                    id="webhookMethod"
                    value={webhookMethod}
                    onChange={(e) => setWebhookMethod(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
                  <p className="font-semibold mb-1">מידע שישלח (Payload):</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>פרטי האירוע (כותרת, תאריכים, תיאור)</li>
                    <li>מידע על האוטומציה</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Create Record Config */}
            {actionType === "CREATE_RECORD" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-700" aria-hidden="true">
                    <TableIcon />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    יצירת רשומה בטבלה
                  </h3>
                </div>

                <div>
                  <label htmlFor="selectedTable" className="block text-sm font-medium text-gray-700 mb-1">
                    בחר טבלה
                  </label>
                  <select
                    id="selectedTable"
                    value={selectedTableId}
                    onChange={(e) => {
                      setSelectedTableId(e.target.value);
                      setRecordFieldMappings([]); // Reset mappings on table change
                    }}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">בחר טבלה...</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTableId &&
                selectedTableSchema &&
                Array.isArray(selectedTableSchema) &&
                selectedTableSchema.length > 0 ? (
                  <div className="space-y-4 border-t pt-4">
                    <p className="font-semibold text-gray-800">מיפוי שדות:</p>
                    <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar p-1">
                      {selectedTableSchema.map((col: any, idx: number) => {
                        // Use column name as the identifier since record.data uses names as keys
                        const colId = col.name;
                        const currentMapping = recordFieldMappings.find(
                          (m) => m.columnId === colId,
                        );

                        return (
                          <div
                            key={colId + idx}
                            className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100"
                          >
                            <div className="w-1/3 shrink-0">
                              <span
                                className="text-sm font-medium text-gray-700 block truncate"
                                title={col.name}
                              >
                                {col.label || col.name}
                              </span>
                              <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full inline-block mt-1">
                                {col.type}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {col.type === "select" ||
                              col.type === "status" ||
                              col.type === "priority" ? (
                                <select
                                  aria-label={col.label || col.name}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                                  value={currentMapping?.value || ""}
                                  onChange={(e) => {
                                    const newVal = e.target.value;
                                    setRecordFieldMappings((prev) => {
                                      const existing = prev.find(
                                        (p) => p.columnId === colId,
                                      );
                                      if (existing) {
                                        if (newVal === "") {
                                          return prev.filter(
                                            (p) => p.columnId !== colId,
                                          );
                                        }
                                        return prev.map((p) =>
                                          p.columnId === colId
                                            ? { ...p, value: newVal }
                                            : p,
                                        );
                                      } else {
                                        if (newVal === "") return prev;
                                        return [
                                          ...prev,
                                          { columnId: colId, value: newVal },
                                        ];
                                      }
                                    });
                                  }}
                                >
                                  <option value="">בחר {col.label}...</option>
                                  {col.options?.map((opt: string) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={
                                    col.type === "number" ||
                                    col.type === "currency"
                                      ? "number"
                                      : col.type === "date"
                                        ? "date"
                                        : "text"
                                  }
                                  aria-label={col.label || col.name}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                                  placeholder={`ערך עבור ${col.label || col.name}`}
                                  value={currentMapping?.value || ""}
                                  onChange={(e) => {
                                    const newVal = e.target.value;
                                    setRecordFieldMappings((prev) => {
                                      const existing = prev.find(
                                        (p) => p.columnId === colId,
                                      );
                                      if (existing) {
                                        if (newVal === "") {
                                          return prev.filter(
                                            (p) => p.columnId !== colId,
                                          );
                                        }
                                        return prev.map((p) =>
                                          p.columnId === colId
                                            ? { ...p, value: newVal }
                                            : p,
                                        );
                                      } else {
                                        if (newVal === "") return prev;
                                        return [
                                          ...prev,
                                          { columnId: colId, value: newVal },
                                        ];
                                      }
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <AvailableVariables />
                  </div>
                ) : (
                  selectedTableId && (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                      <p>לא נמצאו שדות בטבלה זו או שהטבלה ריקה.</p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Create Calendar Event Config */}
            {actionType === "CREATE_CALENDAR_EVENT" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700" aria-hidden="true">
                    <CalendarPlus />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    יצירת אירוע נוסף ביומן
                  </h3>
                </div>

                <div>
                  <label htmlFor="newEventTitle" className="block text-sm font-medium text-gray-700 mb-1">
                    כותרת האירוע
                  </label>
                  <input
                    type="text"
                    id="newEventTitle"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    ניתן להשתמש במשתנים דינמיים
                  </p>
                </div>

                <div>
                  <label htmlFor="newEventDesc" className="block text-sm font-medium text-gray-700 mb-1">
                    תיאור
                  </label>
                  <textarea
                    id="newEventDesc"
                    value={newEventDesc}
                    onChange={(e) => setNewEventDesc(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      מתי להתחיל?
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        aria-label="היסט זמן התחלה"
                        value={newEventStartOffset}
                        onChange={(e) =>
                          setNewEventStartOffset(Number(e.target.value))
                        }
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        aria-label="יחידת היסט התחלה"
                        value={newEventStartUnit}
                        onChange={(e) =>
                          setNewEventStartUnit(
                            e.target.value as "minutes" | "hours" | "days",
                          )
                        }
                        className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="minutes">דקות</option>
                        <option value="hours">שעות</option>
                        <option value="days">ימים</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      0 = מידית בעת הטריגר
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      משך האירוע
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        aria-label="משך האירוע"
                        value={newEventDuration}
                        onChange={(e) =>
                          setNewEventDuration(Number(e.target.value))
                        }
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        aria-label="יחידת משך"
                        value={newEventDurationUnit}
                        onChange={(e) =>
                          setNewEventDurationUnit(
                            e.target.value as "minutes" | "hours",
                          )
                        }
                        className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="minutes">דקות</option>
                        <option value="hours">שעות</option>
                      </select>
                    </div>
                  </div>
                </div>

                <AvailableVariables />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-4 bg-white border-t flex justify-between items-center px-8">
        <button
          onClick={step === 1 ? onCancel : handleBack}
          className="text-gray-500 font-medium px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {step === 1 ? "ביטול" : "חזור"}
        </button>

        <button
          onClick={handleNext}
          className={`
                px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                ${
                  step === 3
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-green-200"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                }
            `}
        >
          {step === 3 ? (
            <>
              <CheckCircle2 aria-hidden="true" size={20} />
              שמור אוטומציה
            </>
          ) : (
            <>
              המשך
              <ArrowLeft aria-hidden="true" size={20} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
