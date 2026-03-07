"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { CalendarDays, User, MessageSquare, AlertTriangle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────
interface MeetingDetails {
  id: string;
  participantName: string;
  participantEmail: string | null;
  participantPhone: string | null;
  startTime: string;
  endTime: string;
  status: string;
  notesBefore: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  meetingType: {
    name: string;
    duration: number;
    color: string | null;
    shareToken: string;
  };
  company: { name: string; logoUrl: string | null };
}

interface TimeSlot {
  start: string;
  end: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const STATUS_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  PENDING: { label: "ממתין לאישור", className: "bg-amber-50 text-amber-700", dotClass: "bg-amber-500" },
  CONFIRMED: { label: "מאושר", className: "bg-emerald-50 text-emerald-700", dotClass: "bg-emerald-500" },
  COMPLETED: { label: "הושלם", className: "bg-blue-50 text-blue-700", dotClass: "bg-blue-500" },
  CANCELLED: { label: "בוטל", className: "bg-red-50 text-red-700", dotClass: "bg-red-500" },
  NO_SHOW: { label: "לא הגיע", className: "bg-gray-50 text-gray-600", dotClass: "bg-gray-400" },
};

function formatDate(d: Date) {
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Skeleton ────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`mtg-skeleton-shimmer ${className}`} />;
}

function PageSkeleton() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC' }}
    >
      <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6 space-y-4">
        <Skeleton className="h-10 w-10 rounded-lg mx-auto" />
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────
export default function ManageMeetingPage({
  params,
}: {
  params: Promise<{ manageToken: string }>;
}) {
  const resolvedParams = useParams<{ manageToken: string }>();
  const manageToken = resolvedParams.manageToken;

  // ── State ──
  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancel flow
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // Copy link
  const [copied, setCopied] = useState(false);

  // Reschedule flow
  const [showReschedule, setShowReschedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);

  // Date range for reschedule (14 days from today)
  const dateRange = useMemo(() => {
    const days: Date[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  // ── Fetch meeting details ──
  useEffect(() => {
    if (!manageToken) return;
    setLoading(true);
    fetch(`/api/p/meetings/manage/${manageToken}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "לא ניתן לטעון את פרטי הפגישה");
        }
        return res.json();
      })
      .then((data) => setMeeting(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [manageToken]);

  // ── Fetch slots when reschedule date changes ──
  useEffect(() => {
    if (!selectedDate || !meeting) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    fetch(
      `/api/p/meetings/${meeting.meetingType.shareToken}/slots?start=${selectedDate}&end=${selectedDate}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("שגיאה בטעינת המשבצות");
        return res.json();
      })
      .then((data) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, meeting]);

  // ── Cancel handler ──
  const handleCancel = useCallback(async () => {
    if (!manageToken) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/p/meetings/manage/${manageToken}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: cancelReason.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "שגיאה בביטול הפגישה");
      }
      setCancelled(true);
      if (meeting) {
        setMeeting({ ...meeting, status: "CANCELLED" });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }, [manageToken, cancelReason, meeting]);

  // ── Reschedule handler ──
  const handleReschedule = useCallback(async () => {
    if (!manageToken || !selectedSlot) return;
    setRescheduling(true);
    try {
      const res = await fetch(
        `/api/p/meetings/manage/${manageToken}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: selectedSlot.start,
            endTime: selectedSlot.end,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "שגיאה בשינוי המועד");
      }
      const updated = await res.json();
      setRescheduled(true);
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              startTime: updated.startTime || selectedSlot.start,
              endTime: updated.endTime || selectedSlot.end,
            }
          : prev
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRescheduling(false);
    }
  }, [manageToken, selectedSlot]);

  const canModify =
    meeting &&
    meeting.status !== "CANCELLED" &&
    meeting.status !== "COMPLETED" &&
    meeting.status !== "NO_SHOW";

  // ─── Render: Loading ──────────────────────────────────────────────
  if (loading) return <PageSkeleton />;

  // ─── Render: Error ────────────────────────────────────────────────
  if (error && !meeting) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC' }}
      >
        <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">שגיאה</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!meeting) return null;

  const statusConfig = STATUS_CONFIG[meeting.status] || {
    label: meeting.status,
    className: "bg-gray-100 text-gray-800",
    dotClass: "bg-gray-400",
  };

  // ─── Render: Success messages ─────────────────────────────────────
  if (cancelled) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC' }}
      >
        <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            הפגישה בוטלה
          </h2>
          <p className="text-gray-500 text-sm">הפגישה בוטלה בהצלחה.</p>
          <div className="mt-6 bg-[#F8FAFC] rounded-xl p-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium">סוג פגישה:</span>{" "}
              {meeting.meetingType.name}
            </p>
            <p>
              <span className="font-medium">תאריך מקורי:</span>{" "}
              {formatDate(new Date(meeting.startTime))}
            </p>
          </div>

          <a
            href={`/p/meetings/${meeting.meetingType.shareToken}`}
            className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            קבעו פגישה חדשה
          </a>
        </div>
      </div>
    );
  }

  if (rescheduled) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC' }}
      >
        <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            המועד עודכן בהצלחה!
          </h2>
          <div className="mt-6 bg-[#F8FAFC] rounded-xl p-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium">סוג פגישה:</span>{" "}
              {meeting.meetingType.name}
            </p>
            <p>
              <span className="font-medium">תאריך חדש:</span>{" "}
              {formatDate(new Date(meeting.startTime))}
            </p>
            <p>
              <span className="font-medium">שעה:</span>{" "}
              {formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}
            </p>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            שמרו את הקישור הזה לניהול הפגישה
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                הקישור הועתק!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                העתק קישור
              </>
            )}
          </button>
          {(() => {
            const startDt = new Date(meeting.startTime);
            const endDt = new Date(meeting.endTime);
            const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
            const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meeting.meetingType.name)}&dates=${fmt(startDt)}/${fmt(endDt)}`;
            return (
              <a
                href={gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                <CalendarDays className="w-4 h-4" />
                הוסף ליומן Google
              </a>
            );
          })()}
        </div>
      </div>
    );
  }

  // ─── Render: Meeting details ──────────────────────────────────────
  return (
    <div
      className="min-h-screen flex items-center justify-start flex-col p-4 pt-8 sm:pt-16"
      style={{ background: 'radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC' }}
    >
      <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 overflow-hidden">
        {/* ── Accent bar at top ── */}
        <div
          className="h-1"
          style={{ backgroundColor: meeting.meetingType.color || "#3b82f6" }}
        />

        {/* ── Header / Branding ── */}
        <div
          className="p-6 pb-4 border-b"
          style={{
            borderBottomColor: meeting.meetingType.color || "#3b82f6",
            borderBottomWidth: "3px",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            {meeting.company.logoUrl ? (
              <img
                src={meeting.company.logoUrl}
                alt={meeting.company.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{
                  backgroundColor: meeting.meetingType.color || "#3b82f6",
                }}
              >
                {meeting.company.name.charAt(0)}
              </div>
            )}
            <span className="text-sm text-gray-500">
              {meeting.company.name}
            </span>
          </div>

          <h1 className="text-xl font-bold text-gray-900">ניהול פגישה</h1>
          <p className="text-sm text-gray-500 mt-1">
            {meeting.meetingType.name}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Status badge ── */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">סטטוס:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.className}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
              {statusConfig.label}
            </span>
          </div>

          {/* ── Meeting details card ── */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <CalendarDays className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(new Date(meeting.startTime))}
                </p>
                <p className="text-sm text-gray-500">
                  {formatTime(meeting.startTime)} -{" "}
                  {formatTime(meeting.endTime)} ({meeting.meetingType.duration}{" "}
                  דקות)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {meeting.participantName}
                </p>
                {meeting.participantEmail && (
                  <p className="text-sm text-gray-500">
                    {meeting.participantEmail}
                  </p>
                )}
                {meeting.participantPhone && (
                  <p className="text-sm text-gray-500">
                    {meeting.participantPhone}
                  </p>
                )}
              </div>
            </div>

            {meeting.notesBefore && (
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-600">{meeting.notesBefore}</p>
              </div>
            )}

            {meeting.cancelReason && (
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-500 font-medium">
                    סיבת ביטול:
                  </p>
                  <p className="text-sm text-gray-600">
                    {meeting.cancelReason}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Error message ── */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* ── Actions (only if meeting can be modified) ── */}
          {canModify && !showCancel && !showReschedule && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowReschedule(true)}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                שנה מועד
              </button>
              <button
                onClick={() => setShowCancel(true)}
                className="flex-1 py-3 px-4 bg-white hover:bg-red-50 text-red-600 border border-red-100 rounded-xl font-semibold text-sm transition-colors"
              >
                בטל פגישה
              </button>
            </div>
          )}

          {/* ── Cancel flow ── */}
          {showCancel && (
            <div className="space-y-3 border border-red-100 rounded-xl p-4 bg-red-50/30">
              <h3 className="text-sm font-semibold text-gray-700">
                ביטול פגישה
              </h3>
              <p className="text-xs text-gray-500">
                האם ברצונכם לבטל את הפגישה? ניתן לציין סיבה.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none bg-white"
                placeholder="סיבת הביטול (אופציונלי)..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      מבטל...
                    </>
                  ) : (
                    "אישור ביטול"
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowCancel(false);
                    setCancelReason("");
                  }}
                  className="py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg font-medium text-sm transition-colors"
                >
                  חזרה
                </button>
              </div>
            </div>
          )}

          {/* ── Reschedule flow ── */}
          {showReschedule && (
            <div className="space-y-4 border border-blue-200 rounded-xl p-4 bg-blue-50/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  שינוי מועד
                </h3>
                <button
                  onClick={() => {
                    setShowReschedule(false);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ביטול
                </button>
              </div>

              {/* Date grid */}
              <div>
                <p className="text-xs text-gray-500 mb-2">בחרו תאריך חדש</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {dateRange.map((d) => {
                    const key = toDateKey(d);
                    const isSelected = selectedDate === key;
                    const dayOfWeek = d.getDay();
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDate(key)}
                        className={`
                          flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors
                          ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200"
                          }
                        `}
                      >
                        <span className="text-[10px] leading-none mb-1 opacity-70">
                          {HEBREW_DAYS[dayOfWeek]}
                        </span>
                        <span className="font-semibold text-sm leading-none">
                          {d.getDate()}
                        </span>
                        <span className="text-[10px] leading-none mt-0.5 opacity-60">
                          {d.toLocaleDateString("he-IL", { month: "short" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slots */}
              {selectedDate && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">בחרו שעה</p>
                  {slotsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 rounded-xl" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-center py-4 text-sm text-gray-400">
                      אין משבצות פנויות בתאריך זה
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {slots.map((slot) => {
                        const isSelected =
                          selectedSlot?.start === slot.start;
                        return (
                          <button
                            key={slot.start}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                              isSelected
                                ? "bg-blue-600 text-white shadow-sm border-blue-600"
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
                            }`}
                          >
                            {formatTime(slot.start)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm reschedule */}
              {selectedSlot && (
                <button
                  onClick={handleReschedule}
                  disabled={rescheduling}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {rescheduling ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      מעדכן מועד...
                    </>
                  ) : (
                    `עדכן ל-${formatTime(selectedSlot.start)}, ${new Date(
                      selectedDate + "T00:00:00"
                    ).toLocaleDateString("he-IL", {
                      day: "numeric",
                      month: "short",
                    })}`
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            מוגש באמצעות מערכת BizlyCRM
          </p>
        </div>
      </div>
    </div>
  );
}
