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
} from "lucide-react";
import { getUsers } from "@/app/actions/users";

interface EventAutomationBuilderProps {
  onSave: (data: {
    minutesBefore: number;
    actionType: string;
    actionConfig: any;
  }) => void;
  onCancel: () => void;
  eventId?: string;

  initialData?: any;
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
}: EventAutomationBuilderProps) {
  const [step, setStep] = useState(1);
  const [users, setUsers] = useState<any[]>([]);

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

  // Load Users
  useEffect(() => {
    getUsers().then((res) => {
      if (res.success && res.data) {
        setUsers(res.data);
      }
    });
  }, []);

  // Initialize from initialData if provided
  useEffect(() => {
    if (onSave && initialData) {
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
        setTaskDueDays(config.dueDays || 0);
      } else if (initialData.actionType === "SEND_NOTIFICATION") {
        setNotifMessage(config.messageTemplate || "");
        setNotifRecipient(config.recipientId ? String(config.recipientId) : "");
      } else if (initialData.actionType === "SEND_WHATSAPP") {
        const phone = config.phoneColumnId?.startsWith("manual:")
          ? config.phoneColumnId.replace("manual:", "")
          : "";
        setWaPhone(phone);
        setWaMessage(config.content || "");
      } else if (initialData.actionType === "WEBHOOK") {
        setWebhookUrl(config.url || "");
        setWebhookMethod(config.method || "POST");
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
        alert("מינימום 5 דקות לפני האירוע");
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

  const handleSave = () => {
    // Validation
    if (actionType === "SEND_WHATSAPP") {
      if (!waPhone || waPhone.trim() === "") {
        alert("חובה להזין מספר טלפון או Group ID");
        return;
      }
    }

    let config = {};
    if (actionType === "CREATE_TASK") {
      config = {
        title: taskTitle,
        description: taskDesc,
        assigneeId: taskAssignee ? Number(taskAssignee) : null,
        priority: taskPriority,
        dueDays: Number(taskDueDays),
      };
    } else if (actionType === "SEND_NOTIFICATION") {
      config = {
        messageTemplate: notifMessage,
        recipientId: notifRecipient ? Number(notifRecipient) : null,
      };
    } else if (actionType === "SEND_WHATSAPP") {
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
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className="flex flex-col items-center relative z-10 w-20"
          >
            <div
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
              <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-6 flex items-center justify-center gap-2">
                <AlertCircle size={16} />
                <span>
                  שימו לב: לא ניתן להגדיר אוטומציה פחות מ-5 דקות לפני האירוע
                </span>
              </div>

              <div className="flex items-center gap-4 justify-center">
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={timeValue}
                    onChange={(e) =>
                      setTimeValue(Math.max(1, Number(e.target.value)))
                    }
                    className="w-24 md:w-32 text-center text-2xl md:text-4xl font-bold border-b-2 border-blue-500 focus:outline-none focus:border-blue-700 bg-transparent py-2"
                  />
                </div>
                <select
                  value={timeUnit}
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
                <Clock className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
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
                  icon: Smartphone,
                  color: "text-green-600",
                  bg: "bg-green-50",
                  border: "hover:border-green-500",
                },
                {
                  id: "WEBHOOK",
                  title: "שליחת Webhook",
                  icon: Webhook,
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  border: "hover:border-purple-500",
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActionType(item.id)}
                  className={`relative p-6 rounded-2xl border-2 transition-all duration-300 text-right group h-48 flex flex-col items-center justify-center gap-4
                                ${actionType === item.id ? `border-blue-500 ring-2 ring-blue-500 ring-offset-2 bg-white shadow-lg` : `border-transparent bg-white shadow hover:shadow-lg ${item.border}`}
                            `}
                >
                  <div
                    className={`p-4 rounded-full ${item.bg} ${item.color} transition-transform group-hover:scale-110 duration-300`}
                  >
                    <item.icon size={32} />
                  </div>
                  <span className="font-bold text-lg text-gray-700 group-hover:text-gray-900">
                    {item.title}
                  </span>

                  {actionType === item.id && (
                    <div className="absolute top-3 right-3 text-blue-500">
                      <CheckCircle2 size={24} className="fill-blue-100" />
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
            {/* Task Config */}
            {actionType === "CREATE_TASK" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg text-green-700">
                    <CheckSquare />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    הגדרת משימה חדשה
                  </h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    כותרת המשימה
                  </label>
                  <div className="relative">
                    <input
                      type="text"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תיאור המשימה
                  </label>
                  <textarea
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      למי להקצות?
                    </label>
                    <div className="relative">
                      <User className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                      <select
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      עדיפות
                    </label>
                    <select
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
                </div>

                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-gray-500" />
                  <span className="text-sm">תאריך יעד:</span>
                  <input
                    type="number"
                    min="0"
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
                  <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700">
                    <Bell />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    שליחת התראה למערכת
                  </h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    למי לשלוח?
                  </label>
                  <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תוכן ההודעה
                  </label>
                  <textarea
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

            {/* WhatsApp Config */}
            {actionType === "SEND_WHATSAPP" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5 relative overflow-hidden">
                {/* Green API Badge */}
                <div className="absolute top-0 left-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-br-lg font-bold tracking-wider">
                  POWERED BY GREEN-API
                </div>

                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg text-green-700">
                    <Smartphone />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-800">
                    הודעת WhatsApp
                  </h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    מספר טלפון (בינלאומי)
                  </label>
                  <div className="relative" dir="ltr">
                    <input
                      type="text"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-left"
                      placeholder="+972501234567"
                    />
                    <div className="absolute right-3 top-2.5 text-gray-400 pointer-events-none">
                      <Smartphone size={16} />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תוכן ההודעה
                  </label>
                  <div className="relative">
                    <textarea
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      rows={5}
                      className="w-full px-4 py-3 bg-[#e6f7ee] border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-800"
                    />
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      <span
                        className="text-[10px] bg-white/50 px-1 rounded text-green-800 border border-green-200 cursor-help"
                        title="שם האירוע"
                      >
                        {"{eventTitle}"}
                      </span>
                      <span
                        className="text-[10px] bg-white/50 px-1 rounded text-green-800 border border-green-200 cursor-help"
                        title="שעת התחלה"
                      >
                        {"{eventStart}"}
                      </span>
                    </div>
                  </div>
                  <AvailableVariables />
                </div>

                {/* WhatsApp Preview */}
                <div className="border border-gray-300 rounded-xl overflow-hidden bg-gray-50 shadow-sm">
                  <div className="bg-gray-800 text-white p-3 text-xs font-mono flex items-center justify-between">
                    <span>API Payload Preview (Green-API)</span>
                    <span className="opacity-50">JSON</span>
                  </div>
                  <div
                    className="p-4 font-mono text-sm overflow-x-auto text-gray-800"
                    dir="ltr"
                  >
                    <pre>
                      {JSON.stringify(
                        {
                          chatId: (() => {
                            let p = waPhone.trim();
                            if (!p) return "MISSING_PHONE_NUMBER";
                            if (p.endsWith("@g.us")) return p;
                            p = p.replace(/\D/g, "");
                            if (p.startsWith("0")) p = "972" + p.substring(1);
                            if (!p.endsWith("@c.us")) p += "@c.us";
                            return p;
                          })(),
                          message: (() => {
                            let m = waMessage
                              .replace(/{eventTitle}/g, "פגישה עם לקוח")
                              .replace(/{eventStart}/g, "10:30, 25/11/2024")
                              .replace(/{eventEnd}/g, "11:30, 25/11/2024");
                            // Basic example replacement
                            return m;
                          })(),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg flex gap-2 items-start text-xs text-blue-700">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <p>
                    שים לב: ההודעה תישלח דרך החשבון המחובר ל-Green API. וודא
                    שהמספר תקין.
                  </p>
                </div>
              </div>
            )}

            {/* Webhook Config */}
            {actionType === "WEBHOOK" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
                <div className="flex items-center gap-3 border-b pb-4 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                    <Webhook />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold">
                    הגדרת Webhook
                  </h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    כתובת URL
                  </label>
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-left"
                    dir="ltr"
                    placeholder="https://api.example.com/webhook"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    שיטת שליחה (Method)
                  </label>
                  <select
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
                  <ul
                    className="list-disc list-inside space-y-1 text-xs opacity-80"
                    dir="ltr"
                  >
                    <li>eventId</li>
                    <li>eventTitle</li>
                    <li>startTime</li>
                    <li>endTime</li>
                    <li>description</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-4 bg-white border-t flex justify-between items-center px-8">
        <button
          onClick={step === 1 ? onCancel : handleBack}
          className="text-gray-500 font-medium px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {step === 1 ? "ביטול" : "חזור"}
        </button>

        <button
          onClick={handleNext}
          className={`
                px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2
                ${
                  step === 3
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-green-200"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                }
            `}
        >
          {step === 3 ? (
            <>
              <CheckCircle2 size={20} />
              שמור אוטומציה
            </>
          ) : (
            <>
              המשך
              <ArrowLeft size={20} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
