"use client";

import React, { useState, useEffect } from "react";
import {
  createGlobalEventAutomation,
  getGlobalEventAutomations,
  deleteGlobalEventAutomation,
  updateGlobalEventAutomation,
  getGlobalAutomationsModalData,
} from "@/app/actions/event-automations";
import {
  Loader2,
  Trash2,
  Bell,
  CheckSquare,
  Webhook,
  Plus,
  Smartphone,
  Zap,
  X,
  Pencil,
  AlertCircle,
  Table as TableIcon,
  CalendarPlus,
} from "lucide-react";
import { EventAutomationBuilder } from "./EventAutomationBuilder";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { showAlert, showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { getAutomationCategoryLimit } from "@/lib/plan-limits";

interface GlobalEventAutomationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalEventAutomationsModal({
  isOpen,
  onClose,
}: GlobalEventAutomationsModalProps) {
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);

  const [userPlan, setUserPlan] = useState("basic");
  const [maxSpecificCount, setMaxSpecificCount] = useState(0);

  // Edit State
  const [editingAutoId, setEditingAutoId] = useState<number | null>(null);
  const [editingAutoData, setEditingAutoData] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getGlobalAutomationsModalData()
        .then((res) => {
          if (res.success && res.data) {
            setAutomations(res.data.automations);
            setUserPlan(res.data.userPlan as string);
            setMaxSpecificCount(res.data.maxSpecificCount);
          }
        })
        .catch((e) => {
          console.error("Failed to load global automations data", e);
          toast.error(getUserFriendlyError(e));
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen]);

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const res = await getGlobalEventAutomations();
      if (res.success) {
        setAutomations(res.data || []);
      }
    } catch (e) {
      console.error("Failed to load global automations", e);
      toast.error(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutomation = async (data: {
    minutesBefore: number;
    actionType: string;
    actionConfig: any;
  }) => {
    try {
      let res;
      if (editingAutoId) {
        // Update
        res = await updateGlobalEventAutomation({
          id: editingAutoId,
          minutesBefore: data.minutesBefore,
          actionType: data.actionType,
          actionConfig: data.actionConfig,
          name: "Global Automation", // Optional naming
        });
      } else {
        // Create
        res = await createGlobalEventAutomation({
          minutesBefore: data.minutesBefore,
          actionType: data.actionType,
          actionConfig: data.actionConfig,
        });
      }

      if (res.success) {
        toast.success("האוטומציה נשמרה בהצלחה");
        setShowBuilder(false);
        setEditingAutoId(null);
        setEditingAutoData(null);
        loadAutomations();
      } else {
        toast.error(getUserFriendlyError(res.error));
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await showConfirm("האם אתה בטוח שברצונך למחוק אוטומציה קבועה זו?"))) return;
    try {
      await deleteGlobalEventAutomation(id);
      toast.success("האוטומציה נמחקה בהצלחה");
      loadAutomations();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleEdit = (auto: any) => {
    setEditingAutoId(auto.id);
    setEditingAutoData(auto);
    setShowBuilder(true);
  };

  const handleOpenBuilder = () => {
    // Check global limits
    const limit = getAutomationCategoryLimit(userPlan);

    // Check if adding another global automation would violate the limit for ANY existing event
    // that already has specific automations
    const potentialTotal = automations.length + maxSpecificCount;

    // However, if we add a global one, it adds 1 to the global count for everyone.
    // If I have 6 specials on one event, and 0 globals.
    // I try to add 1 global. New total for that event = 6 + 1 = 7 > 6. BLOCKED.

    // Wait, the logic is: Global Count (existing) + 1 (new) + Max Specific <= Limit

    if (automations.length + 1 + maxSpecificCount > limit) {
      showAlert(
        `לא ניתן להוסיף אוטומציה קבועה נוספת.\n\n` +
          `נמצא אירוע ביומן שיש לו ${maxSpecificCount} אוטומציות ספציפיות.\n` +
          `הוספת אוטומציה קבועה תביא לחריגה מהמגבלה של ${limit} אוטומציות לאותו אירוע.`,
      );
      return;
    }

    if (automations.length >= limit) {
      showAlert(`הגעת למגבלת האוטומציות הקבועות (${limit}). שדרג כדי להוסיף עוד.`);
      return;
    }

    setShowBuilder(true);
  };

  const handleCloseBuilder = () => {
    setShowBuilder(false);
    setEditingAutoId(null);
    setEditingAutoData(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] backdrop-blur-sm p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (showBuilder) {
            handleCloseBuilder();
          } else {
            onClose();
          }
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col">
        {showBuilder ? (
          <EventAutomationBuilder
            onSave={handleSaveAutomation}
            onCancel={handleCloseBuilder}
            initialData={editingAutoData}
            userPlan={userPlan}
            globalCount={automations.length}
            specificCount={0} // Global builder doesn't know about specific context
          />
        ) : (
          <>
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Zap className="fill-yellow-400 text-yellow-400" />
                  </div>
                  אוטומציות קבועות ליומן
                </h2>
                <p className="text-indigo-100 mt-2 text-sm max-w-xl">
                  אוטומציות שתגדיר כאן ייווצרו באופן אוטומטי עבור כל אירוע חדש
                  שיתווסף ליומן.
                </p>
                <div className="mt-3 bg-white/10 border border-white/20 rounded-lg p-3 text-xs flex items-center gap-2 max-w-fit">
                  <span className="bg-white text-indigo-700 px-1.5 rounded font-bold">
                    !
                  </span>
                  שים לב: השינויים יחולו רק על אירועים שיווצרו מעתה ואילך
                </div>
              </div>
              <button
                onClick={onClose}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Disclaimer Bar */}
            <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-start gap-3">
              <AlertCircle
                className="text-indigo-600 shrink-0 mt-0.5"
                size={18}
              />
              <div className="text-sm text-indigo-900 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold">
                    סטטוס מנוי:{" "}
                    {userPlan === "super"
                      ? "Super (ללא הגבלה)"
                      : userPlan === "premium"
                        ? "Premium (עד 6 אוטומציות)"
                        : "Basic (עד 2 אוטומציות)"}
                  </p>
                  {userPlan !== "super" && (
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                      {automations.length} מתוך {userPlan === "premium" ? 6 : 2}{" "}
                      אוטומציות קבועות בשימוש
                    </span>
                  )}
                </div>
                {userPlan !== "super" && (
                  <div className="mb-2">
                    <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          automations.length >= (userPlan === "premium" ? 6 : 2)
                            ? "bg-red-500"
                            : automations.length >=
                                (userPlan === "premium" ? 4 : 1)
                              ? "bg-yellow-500"
                              : "bg-indigo-600"
                        }`}
                        style={{
                          width: `${Math.min(100, (automations.length / (userPlan === "premium" ? 6 : 2)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-indigo-700 text-xs">
                  {userPlan === "super"
                    ? "ניתן ליצור כמות בלתי מוגבלת של אוטומציות קבועות וספציפיות."
                    : `המגבלה כוללת את סכום האוטומציות הקבועות והספציפיות יחד. המערכת תוודא שלא תחרגו מהמגבלה בכל אירוע.`}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
              {/* List */}
              <div className="space-y-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
                    <span className="text-gray-500 font-medium">
                      טוען אוטומציות...
                    </span>
                  </div>
                ) : automations.length === 0 ? (
                  <div className="text-center py-20 px-4 border-2 border-dashed border-gray-300 rounded-2xl bg-white/50">
                    <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm mb-6">
                      <Zap className="text-indigo-300 w-10 h-10" />
                    </div>
                    <h4 className="text-gray-900 font-bold text-lg mb-2">
                      אין אוטומציות קבועות
                    </h4>
                    <p className="text-gray-500 max-w-sm mx-auto mb-8">
                      צור אוטומציה קבועה שתחול על כל האירועים החדשים ותחסוך זמן
                      יקר ביצירת אירועים חוזרים.
                    </p>
                    <button
                      onClick={handleOpenBuilder}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center mx-auto gap-2"
                    >
                      <Plus size={20} />
                      צור אוטומציה ראשונה
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-700">
                        האוטומציות שלי ({automations.length})
                      </h3>
                      <button
                        onClick={handleOpenBuilder}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
                      >
                        <Plus size={16} />
                        הוסף חדש
                      </button>
                    </div>

                    <div className="grid gap-4">
                      {automations.map((auto) => {
                        let displayName = auto.name || "אוטומציה ללא שם";
                        // Legacy translation
                        if (
                          displayName.includes("Global Event Automation") ||
                          displayName.includes("Event Automation")
                        ) {
                          displayName = displayName
                            .replace(
                              "Global Event Automation",
                              "אוטומציה גלובלית של אירועי יומן",
                            )
                            .replace("Event Automation", "אוטומציה לאירוע");

                          if (displayName.includes("m before")) {
                            displayName = displayName.replace(
                              "m before",
                              " דקות לפני",
                            );
                          }
                        }

                        return (
                          <div
                            key={auto.id}
                            className="bg-white border border-gray-200 rounded-xl p-5 flex justify-between items-center shadow-sm hover:shadow-md transition-all group hover:border-indigo-300"
                          >
                            <div className="flex items-center gap-5">
                              <div
                                className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                                  auto.actionType === "SEND_NOTIFICATION"
                                    ? "bg-yellow-50 text-yellow-600"
                                    : auto.actionType === "CREATE_TASK"
                                      ? "bg-green-50 text-green-600"
                                      : auto.actionType === "SEND_WHATSAPP"
                                        ? "bg-[#e6f7ee] text-green-700"
                                        : auto.actionType === "CREATE_RECORD"
                                          ? "bg-blue-50 text-blue-600"
                                          : auto.actionType ===
                                              "CREATE_CALENDAR_EVENT"
                                            ? "bg-indigo-50 text-indigo-600"
                                            : "bg-purple-50 text-purple-600"
                                }`}
                              >
                                {auto.actionType === "SEND_NOTIFICATION" ? (
                                  <Bell size={24} />
                                ) : auto.actionType === "CREATE_TASK" ? (
                                  <CheckSquare size={24} />
                                ) : auto.actionType === "SEND_WHATSAPP" ? (
                                  <WhatsAppIcon size={24} />
                                ) : auto.actionType === "CREATE_RECORD" ? (
                                  <TableIcon size={24} />
                                ) : auto.actionType ===
                                  "CREATE_CALENDAR_EVENT" ? (
                                  <CalendarPlus size={24} />
                                ) : (
                                  <Webhook size={24} />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-gray-800 text-lg">
                                    {displayName}
                                  </span>
                                  <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full border border-indigo-100 font-medium">
                                    קבוע
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-medium flex items-center gap-1">
                                    <Zap size={12} />
                                    {auto.triggerConfig?.minutesBefore} דקות
                                    לפני
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span>
                                    {auto.actionType === "SEND_NOTIFICATION"
                                      ? "שליחת התראה למערכת"
                                      : auto.actionType === "CREATE_TASK"
                                        ? "משימה אוטומטית"
                                        : auto.actionType === "SEND_WHATSAPP"
                                          ? "הודעת WhatsApp"
                                          : auto.actionType === "CREATE_RECORD"
                                            ? "יצירת רשומה בטבלה"
                                            : auto.actionType ===
                                                "CREATE_CALENDAR_EVENT"
                                              ? "יצירת אירוע נוסף ביומן"
                                              : "Webhook"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(auto)}
                                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
                                title="ערוך"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(auto.id)}
                                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                title="מחק"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
