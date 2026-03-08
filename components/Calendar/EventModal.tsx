"use client";

import React, { useState, useEffect } from "react";
import { CalendarEvent, defaultEventColors } from "@/lib/types";
import {
  createEventAutomation,
  updateEventAutomation,
  getEventAutomations,
  deleteEventAutomation,
  getEventModalInitData,
} from "@/app/actions/event-automations";
import {
  Loader2,
  Trash2,
  Bell,
  CheckSquare,
  Webhook,
  Plus,
  Smartphone,
  Calendar as CalendarIcon,
  X,
  Table as TableIcon,
  CalendarPlus,
} from "lucide-react";
import { EventAutomationBuilder } from "./EventAutomationBuilder";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { showAlert, showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, "id">) => Promise<string | false>;
  onDelete?: () => void;
  event?: CalendarEvent;
  initialDate?: Date;
  initialHour?: number;
  initialMinutes?: number;
  initialTab?: "details" | "automations";
}

export function EventModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  event,
  initialDate,
  initialHour = 9,
  initialMinutes = 0,
  initialTab = "details",
}: EventModalProps) {
  const isGoogleEvent = event?.source === "google";

  const [activeTab, setActiveTab] = useState<"details" | "automations">(
    initialTab,
  );

  // --- Details State ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [color, setColor] = useState(defaultEventColors[0]);
  const [saving, setSaving] = useState(false);

  // --- Automations State ---
  const [automations, setAutomations] = useState<any[]>([]);
  const [pendingAutomations, setPendingAutomations] = useState<
    Array<{ minutesBefore: number; actionType: string; actionConfig: any }>
  >([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAutoId, setEditingAutoId] = useState<number | null>(null);
  const [editingPendingIndex, setEditingPendingIndex] = useState<number | null>(null);
  const [editingAutoData, setEditingAutoData] = useState<any>(null);
  const [userPlan, setUserPlan] = useState("basic");
  const [globalAutomationCount, setGlobalAutomationCount] = useState(0);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || "");
      setStartDate(formatDateForInput(event.startTime));
      setStartTime(formatTimeForInput(event.startTime));
      setEndDate(formatDateForInput(event.endTime));
      setEndTime(formatTimeForInput(event.endTime));
      setColor(event.color || defaultEventColors[0]);
    } else if (initialDate) {
      const date = formatDateForInput(initialDate);
      setStartDate(date);
      setEndDate(date);
      // Calculate end hour and minutes (start + 1 hour)
      let endHr = initialHour;
      let endMin = initialMinutes + 60; // Add 60 minutes for 1 hour duration
      if (endMin >= 60) {
        endHr += Math.floor(endMin / 60);
        endMin = endMin % 60;
      }
      // If end hour goes past 23, cap at 23:59
      if (endHr >= 24) {
        endHr = 23;
        endMin = 59;
      }
      setStartTime(
        `${initialHour.toString().padStart(2, "0")}:${initialMinutes.toString().padStart(2, "0")}`,
      );
      setEndTime(
        `${endHr.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`,
      );
      setColor(defaultEventColors[0]);
      setAutomations([]);
    }
  }, [event, initialDate, initialHour, initialMinutes]);

  // Reset tab when opening/closing — combined init (1 DB round-trip instead of 3)
  useEffect(() => {
    if (isOpen) {
      setActiveTab("details");
      setShowBuilder(false);
      if (event) setLoadingAutomations(true);
      getEventModalInitData(event?.id)
        .then((res) => {
          if (res.success && res.data) {
            setUserPlan(res.data.userPlan as string);
            setGlobalAutomationCount(res.data.globalAutomationCount);
            if (event) {
              setAutomations(res.data.eventAutomations);
            }
          }
        })
        .finally(() => {
          setLoadingAutomations(false);
        });
    }
  }, [isOpen]);

  const loadAutomations = async (eventId: string) => {
    setLoadingAutomations(true);
    try {
      const res = await getEventAutomations(eventId);
      if (res.success) {
        setAutomations(res.data || []);
      }
    } catch (e) {
      console.error("Failed to load automations", e);
    } finally {
      setLoadingAutomations(false);
    }
  };

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTimeForInput = (date: Date): string => {
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);

    const newEvent: Omit<CalendarEvent, "id"> = {
      title,
      description,
      startTime: new Date(
        startYear,
        startMonth - 1,
        startDay,
        startHours,
        startMinutes,
      ),
      endTime: new Date(endYear, endMonth - 1, endDay, endHours, endMinutes),
      color,
    };

    setSaving(true);
    try {
      const result = await onSave(newEvent);
      if (result) {
        // If we have pending automations and this was a new event, save them in parallel
        if (!event && pendingAutomations.length > 0) {
          const results = await Promise.allSettled(
            pendingAutomations.map((auto) =>
              createEventAutomation({
                eventId: result,
                minutesBefore: auto.minutesBefore,
                actionType: auto.actionType,
                actionConfig: auto.actionConfig,
              })
            )
          );
          for (const r of results) {
            if (r.status === "rejected") {
              console.error("Failed to create pending automation", r.reason);
            }
          }
        }
        handleClose();
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setColor(defaultEventColors[0]);
    setShowBuilder(false);
    setEditingAutoId(null);
    setEditingPendingIndex(null);
    setEditingAutoData(null);
    setPendingAutomations([]);
    onClose();
  };

  const handleCreateAutomation = async (data: {
    minutesBefore: number;
    actionType: string;
    actionConfig: any;
  }) => {
    if (!event) {
      // New event — store in pending list
      if (editingPendingIndex !== null) {
        setPendingAutomations((prev) =>
          prev.map((a, i) => (i === editingPendingIndex ? data : a)),
        );
      } else {
        setPendingAutomations((prev) => [...prev, data]);
      }
      setShowBuilder(false);
      setEditingPendingIndex(null);
      setEditingAutoData(null);
      return;
    }

    try {
      let res;
      if (editingAutoId) {
        res = await updateEventAutomation({
          id: editingAutoId,
          minutesBefore: data.minutesBefore,
          actionType: data.actionType,
          actionConfig: data.actionConfig,
        });
      } else {
        res = await createEventAutomation({
          eventId: event.id,
          minutesBefore: data.minutesBefore,
          actionType: data.actionType,
          actionConfig: data.actionConfig,
        });
      }

      if (res.success) {
        toast.success("האוטומציה נשמרה בהצלחה");
        loadAutomations(event.id);
      } else {
        toast.error(getUserFriendlyError(res.error));
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }

    setShowBuilder(false);
    setEditingAutoId(null);
    setEditingAutoData(null);
  };

  const handleEditAuto = (auto: any) => {
    setEditingAutoId(auto.id);
    setEditingAutoData(auto);
    setShowBuilder(true);
  };

  const handleOpenBuilder = () => {
    // Check limits
    const limit =
      userPlan === "super" ? Infinity : userPlan === "premium" ? 6 : 2;
    const displayAutos = event ? automations : pendingAutomations;
    const currentTotal = globalAutomationCount + displayAutos.length;

    // If not editing (creating new), check limit
    if (!editingAutoId && editingPendingIndex === null && currentTotal >= limit) {
      showAlert(
        `הגעת למגבלת האוטומציות לאירוע (${limit}). שדרג את החבילה כדי להוסיף עוד.`,
      );
      return;
    }

    setShowBuilder(true);
  };

  const handleDeleteAuto = async (id: number) => {
    if (!(await showConfirm("להסיר אוטומציה זו?"))) return;
    try {
      await deleteEventAutomation(id);
      toast.success("האוטומציה נמחקה בהצלחה");
      if (event) loadAutomations(event.id);
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleEditPending = (index: number) => {
    const auto = pendingAutomations[index];
    setEditingPendingIndex(index);
    setEditingAutoData({
      triggerConfig: { minutesBefore: auto.minutesBefore },
      actionType: auto.actionType,
      actionConfig: auto.actionConfig,
    });
    setShowBuilder(true);
  };

  const handleDeletePending = async (index: number) => {
    if (!(await showConfirm("להסיר אוטומציה זו?"))) return;
    setPendingAutomations((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  // -- If Builder Mode --
  if (showBuilder) {
    const displayAutos = event ? automations : pendingAutomations;
    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70]"
        dir="rtl"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowBuilder(false);
            setEditingAutoId(null);
            setEditingPendingIndex(null);
            setEditingAutoData(null);
          }
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] md:h-[800px] mx-4 relative overflow-hidden flex flex-col">
          <EventAutomationBuilder
            onSave={handleCreateAutomation}
            onCancel={() => {
              setShowBuilder(false);
              setEditingAutoId(null);
              setEditingPendingIndex(null);
              setEditingAutoData(null);
            }}
            eventId={event?.id}
            initialData={editingAutoData}
            userPlan={userPlan}
            globalCount={globalAutomationCount}
            specificCount={displayAutos.length}
          />
        </div>
      </div>
    );
  }

  // -- Normal Modal --
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="bg-gray-50 border-b border-gray-200 relative">
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 transition-colors bg-white rounded-full p-1 shadow-sm border border-gray-200 hover:shadow"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center justify-between p-6 pb-0 pt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {isGoogleEvent
                ? "אירוע Google Calendar"
                : event
                  ? activeTab === "details"
                    ? "עריכת אירוע"
                    : "אוטומציות לאירוע"
                  : "אירוע חדש"}
            </h2>
          </div>

          {/* Tabs */}
          {!isGoogleEvent && (
          <div className="flex gap-6 px-6">
            <button
              onClick={() => setActiveTab("details")}
              className={`pb-3 px-2 text-sm font-medium transition-all border-b-2 ${
                activeTab === "details"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              פרטי אירוע
            </button>
            <button
              onClick={() => setActiveTab("automations")}
              className={`pb-3 px-2 text-sm font-medium transition-all border-b-2 flex items-center gap-1.5 ${
                activeTab === "automations"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              אוטומציות
              {(event ? automations.length : pendingAutomations.length) > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">
                  {event ? automations.length : pendingAutomations.length}
                </span>
              )}
            </button>
          </div>
          )}
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {isGoogleEvent ? (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                אירוע זה מגוגל קלנדר - ניתן לערוך רק בגוגל קלנדר
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">כותרת</label>
                <p className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800">{event?.title}</p>
              </div>

              {event?.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">תיאור</label>
                  <p className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 text-sm whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">התחלה</label>
                  <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                    {event?.startTime.toLocaleDateString("he-IL")} {event?.startTime.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">סיום</label>
                  <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                    {event?.endTime.toLocaleDateString("he-IL")} {event?.endTime.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-6 mt-4 border-t border-gray-100">
                {event?.googleEventUrl && (
                  <a
                    href={event.googleEventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-sm font-medium"
                  >
                    <CalendarIcon size={16} />
                    פתח בגוגל קלנדר
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm mr-auto"
                >
                  סגור
                </button>
              </div>
            </div>
          ) : activeTab === "details" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-bold text-gray-700 mb-1.5"
                >
                  כותרת האירוע
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg shadow-sm"
                  placeholder="לדוגמה: פגישת היכרות שיווקית"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  תיאור והערות
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                  placeholder="פרטים נוספים על האירוע..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="startDate"
                      className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide"
                    >
                      התחלה
                    </label>
                    <div className="flex flex-col gap-2">
                      <input
                        type="date"
                        id="startDate"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        required
                      />
                      <input
                        type="time"
                        id="startTime"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="endDate"
                      className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide"
                    >
                      סיום
                    </label>
                    <div className="flex flex-col gap-2">
                      <input
                        type="date"
                        id="endDate"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        required
                      />
                      <input
                        type="time"
                        id="endTime"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  צבע תצוגה
                </label>
                <div className="flex gap-2 p-1.5 bg-gray-50 rounded-xl border border-gray-100 w-fit">
                  {defaultEventColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform hover:scale-110 shadow-sm ${
                        color === c
                          ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-6 mt-4 border-t border-gray-100">
                {event && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      handleClose();
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Trash2 size={16} />
                    מחק אירוע
                  </button>
                )}
                <div className="flex gap-3 mr-auto">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-blue-200 shadow-md font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {event ? "שמור שינויים" : "צור אירוע"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-6 h-full flex flex-col">
                  {/* Status Bar */}
                  {userPlan !== "super" && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-blue-900">
                          סטטוס מנוי:{" "}
                          {userPlan === "premium"
                            ? "Premium (עד 6 אוטומציות)"
                            : "Basic (עד 2 אוטומציות)"}
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-bold border border-blue-200">
                          {globalAutomationCount + (event ? automations : pendingAutomations).length} מתוך{" "}
                          {userPlan === "premium" ? 6 : 2} בשימוש
                        </span>
                      </div>
                      <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            globalAutomationCount + (event ? automations : pendingAutomations).length >=
                            (userPlan === "premium" ? 6 : 2)
                              ? "bg-red-500"
                              : globalAutomationCount + (event ? automations : pendingAutomations).length >=
                                  (userPlan === "premium" ? 4 : 1)
                                ? "bg-yellow-500"
                                : "bg-blue-600"
                          }`}
                          style={{
                            width: `${Math.min(100, ((globalAutomationCount + (event ? automations : pendingAutomations).length) / (userPlan === "premium" ? 6 : 2)) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[10px] text-blue-600">
                        <span>{globalAutomationCount} קבועות</span>
                        <span>{(event ? automations : pendingAutomations).length} ספציפיות לאירוע</span>
                      </div>
                    </div>
                  )}
                  {userPlan === "super" && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-purple-900">
                        סטטוס מנוי: Super (ללא הגבלה)
                      </span>
                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        ∞
                      </span>
                    </div>
                  )}

                  {/* Add New Button */}
                  <button
                    onClick={handleOpenBuilder}
                    className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl p-1 shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 transition-all transform hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                    <div className="bg-white/10 backdrop-blur-sm rounded-[10px] py-4 flex items-center justify-center gap-3">
                      <div className="bg-white/20 p-1.5 rounded-full">
                        <Plus size={20} className="text-white" />
                      </div>
                      <span className="font-bold text-lg">
                        {editingAutoId || editingPendingIndex !== null ? "ערוך אוטומציה" : "בנה אוטומציה חדשה"}
                      </span>
                    </div>
                  </button>

                  {/* List */}
                  <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                    {event && loadingAutomations ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                        <span className="text-sm text-gray-500">
                          טוען אוטומציות...
                        </span>
                      </div>
                    ) : (event ? automations : pendingAutomations).length === 0 ? (
                      <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                        <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-sm mb-4">
                          <Webhook className="text-gray-300 w-8 h-8" />
                        </div>
                        <h4 className="text-gray-900 font-medium mb-1">
                          אין אוטומציות מוגדרות
                        </h4>
                        <p className="text-gray-500 text-sm">
                          הוסף אוטומציות כדי לחסוך זמן ולייעל את העבודה
                        </p>
                      </div>
                    ) : event ? (
                      <div className="space-y-3">
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
                              className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-inner ${
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
                                              : "bg-gray-50 text-gray-600"
                                  }`}
                                >
                                  {auto.actionType === "SEND_NOTIFICATION" ? (
                                    <Bell size={20} />
                                  ) : auto.actionType === "CREATE_TASK" ? (
                                    <CheckSquare size={20} />
                                  ) : auto.actionType === "SEND_WHATSAPP" ? (
                                    <WhatsAppIcon size={20} />
                                  ) : auto.actionType === "CREATE_RECORD" ? (
                                    <TableIcon size={20} />
                                  ) : auto.actionType ===
                                    "CREATE_CALENDAR_EVENT" ? (
                                    <CalendarPlus size={20} />
                                  ) : (
                                    <Webhook size={20} />
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-gray-800">
                                    {displayName}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-medium">
                                      {auto.triggerConfig?.minutesBefore} דקות
                                      לפני
                                    </span>
                                    <span>•</span>
                                    <span>
                                      {auto.actionType === "SEND_NOTIFICATION"
                                        ? "התראה"
                                        : auto.actionType === "CREATE_TASK"
                                          ? "משימה"
                                          : auto.actionType === "SEND_WHATSAPP"
                                            ? "WhatsApp"
                                            : auto.actionType ===
                                                "CREATE_RECORD"
                                              ? "רשומה"
                                              : auto.actionType ===
                                                  "CREATE_CALENDAR_EVENT"
                                                ? "אירוע"
                                                : "פעולה"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2 opacity-100">
                                <button
                                  onClick={() => handleEditAuto(auto)}
                                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                                  title="ערוך אוטומציה"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="lucide lucide-pencil"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    <path d="m15 5 4 4" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteAuto(auto.id)}
                                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                  title="מחק אוטומציה"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingAutomations.map((auto, index) => (
                          <div
                            key={index}
                            className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-inner ${
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
                                            : "bg-gray-50 text-gray-600"
                                }`}
                              >
                                {auto.actionType === "SEND_NOTIFICATION" ? (
                                  <Bell size={20} />
                                ) : auto.actionType === "CREATE_TASK" ? (
                                  <CheckSquare size={20} />
                                ) : auto.actionType === "SEND_WHATSAPP" ? (
                                  <WhatsAppIcon size={20} />
                                ) : auto.actionType === "CREATE_RECORD" ? (
                                  <TableIcon size={20} />
                                ) : auto.actionType ===
                                  "CREATE_CALENDAR_EVENT" ? (
                                  <CalendarPlus size={20} />
                                ) : (
                                  <Webhook size={20} />
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-gray-800">
                                  אוטומציה חדשה
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-medium">
                                    {auto.minutesBefore} דקות לפני
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {auto.actionType === "SEND_NOTIFICATION"
                                      ? "התראה"
                                      : auto.actionType === "CREATE_TASK"
                                        ? "משימה"
                                        : auto.actionType === "SEND_WHATSAPP"
                                          ? "WhatsApp"
                                          : auto.actionType === "CREATE_RECORD"
                                            ? "רשומה"
                                            : auto.actionType ===
                                                "CREATE_CALENDAR_EVENT"
                                              ? "אירוע"
                                              : "פעולה"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 opacity-100">
                              <button
                                onClick={() => handleEditPending(index)}
                                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                                title="ערוך אוטומציה"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="lucide lucide-pencil"
                                >
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  <path d="m15 5 4 4" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeletePending(index)}
                                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                title="מחק אוטומציה"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
