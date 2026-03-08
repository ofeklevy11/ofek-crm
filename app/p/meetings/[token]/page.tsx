"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { he } from "date-fns/locale";
import {
  ArrowRight,
  Clock,
  CalendarDays,
  Globe,
  Plus,
  X,
  RefreshCw,
  XCircle,
  Link2,
  Sparkles,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────
interface MeetingTypeInfo {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  color: string | null;
  customFields: CustomField[];
  minAdvanceHours: number;
  maxAdvanceDays: number;
  availableDays: number[];
  company: { name: string; logoUrl: string | null };
}

interface CustomField {
  id: string;
  label: string;
  type: "text" | "number" | "email" | "phone" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface BookingResult {
  meetingId: string;
  manageToken: string;
  startTime: string;
  endTime: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function formatDate(d: Date) {
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// ─── Dark input classes (shared) ─────────────────────────────────────
const DARK_INPUT =
  "w-full px-3 py-2.5 bg-white/[0.08] border border-white/[0.15] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-shadow duration-200";

// ─── Skeleton components ─────────────────────────────────────────────
function DarkSkeleton({ className = "" }: { className?: string }) {
  return <div className={`mtg-dark-skeleton ${className}`} />;
}

// ─── Confetti ────────────────────────────────────────────────────────
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9", "#F8C471", "#82E0AA"];
    return Array.from({ length: 10 }).map((_, i) => {
      const angle = (i / 10) * 360;
      const rad = (angle * Math.PI) / 180;
      const dist = 80 + Math.random() * 120;
      return {
        key: i,
        color: colors[i % colors.length],
        cx: `${Math.cos(rad) * dist}px`,
        cy: `${Math.sin(rad) * dist}px`,
        cr: `${Math.random() * 720 - 360}deg`,
        delay: `${Math.random() * 0.3}s`,
        size: 6 + Math.random() * 6,
      };
    });
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {pieces.map((p) => (
        <div
          key={p.key}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            "--cx": p.cx,
            "--cy": p.cy,
            "--cr": p.cr,
            animation: `confettiBurst 0.8s ease-out ${p.delay} both`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ─── Background style constant ──────────────────────────────────────
const BG_STYLE: React.CSSProperties = {
  background: "radial-gradient(ellipse at center, #1a3a2a 0%, #0d1f15 100%)",
};

const CARD_CLASSES =
  "w-full max-w-[1100px] bg-[#162e22]/90 backdrop-blur-sm rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)] border border-white/10 overflow-hidden";

// ─── BackgroundDecor ─────────────────────────────────────────────────
function BackgroundDecor() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Top-right circle */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(45,212,191,0.15) 0%, transparent 70%)",
        }}
      />
      {/* Bottom-left circle */}
      <div
        className="absolute -bottom-60 -left-60 w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)",
        }}
      />
      {/* Mid-left circle */}
      <div
        className="absolute top-1/3 -left-20 w-[350px] h-[350px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(45,212,191,0.08) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────
function TopBar({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium text-white/80">{name}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-6 h-6 rounded flex items-center justify-center text-white/20">
          <Plus className="w-3.5 h-3.5" />
        </div>
        <div className="w-6 h-6 rounded flex items-center justify-center text-white/20">
          <X className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}

// ─── LeftPanel ───────────────────────────────────────────────────────
function LeftPanel({
  info,
  themeColor,
  selectedDate,
  selectedSlot,
}: {
  info: MeetingTypeInfo;
  themeColor: string;
  selectedDate?: Date;
  selectedSlot?: TimeSlot | null;
}) {
  return (
    <div className="w-full md:w-[280px] shrink-0 p-5 space-y-4">
      {/* Meeting title */}
      <h1 className="text-lg font-bold text-white">{info.name}</h1>

      {/* Organizer */}
      <div className="flex items-center gap-2.5">
        {info.company.logoUrl ? (
          <img
            src={info.company.logoUrl}
            alt={info.company.name}
            className="w-9 h-9 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: themeColor }}
          >
            {info.company.name.charAt(0)}
          </div>
        )}
        <span className="text-sm text-white/60">{info.company.name}</span>
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Clock className="w-4 h-4" />
        <span>{info.duration} {"\u05D3\u05E7\u05D5\u05EA"}</span>
      </div>

      {/* Description */}
      {info.description && (
        <p className="text-sm text-white/40 leading-relaxed">{info.description}</p>
      )}

      {/* Timezone */}
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Globe className="w-3.5 h-3.5" />
        <span>{"\u05E9\u05E2\u05D5\u05DF \u05D9\u05E9\u05E8\u05D0\u05DC"} (Asia/Jerusalem)</span>
      </div>

      {/* Selected date/time (step 3) */}
      {selectedDate && selectedSlot && (
        <div className="pt-3 mt-2 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{formatDate(selectedDate)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────
export default function MeetingBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = useParams<{ token: string }>();
  const token = resolvedParams.token;

  // ── State ──
  const [info, setInfo] = useState<MeetingTypeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [stepDirection, setStepDirection] = useState<"forward" | "back">("forward");

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    notes: string;
    customFields: Record<string, string>;
  }>({ name: "", email: "", phone: "", notes: "", customFields: {} });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingResult | null>(null);

  // Management states
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlot, setRescheduleSlot] = useState<TimeSlot | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const themeColor = info?.color || "#3b82f6";

  // ── Calendar bounds ──
  const calendarBounds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDays = info?.maxAdvanceDays || 30;
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + maxDays);
    return { fromDate: today, toDate };
  }, [info]);

  // ── Disable days of week that have no availability ──
  const disabledDaysMatcher = useMemo(() => {
    if (!info?.availableDays) return undefined;
    const availableSet = new Set(info.availableDays);
    return (date: Date) => !availableSet.has(date.getDay());
  }, [info]);

  // ── Fetch meeting type info ──
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/p/meetings/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05D8\u05E2\u05D5\u05DF \u05D0\u05EA \u05E4\u05E8\u05D8\u05D9 \u05D4\u05E4\u05D2\u05D9\u05E9\u05D4");
        }
        return res.json();
      })
      .then((data) => setInfo(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Fetch slots when date changes ──
  useEffect(() => {
    if (!selectedDateKey || !token) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    fetch(
      `/api/p/meetings/${token}/slots?start=${selectedDateKey}&end=${selectedDateKey}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05D4\u05DE\u05E9\u05D1\u05E6\u05D5\u05EA \u05D4\u05E4\u05E0\u05D5\u05D9\u05D5\u05EA");
        return res.json();
      })
      .then((data) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDateKey, token]);

  // ── Navigation helpers ──
  const goToStep = useCallback((step: 1 | 2 | 3) => {
    setStepDirection(step > currentStep ? "forward" : "back");
    setCurrentStep(step);
  }, [currentStep]);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedDateKey(toDateKey(date));
    setTimeout(() => {
      setStepDirection("forward");
      setCurrentStep(2);
    }, 300);
  }, []);

  const handleSlotSelect = useCallback((slot: TimeSlot) => {
    setSelectedSlot(slot);
    setTimeout(() => {
      setStepDirection("forward");
      setCurrentStep(3);
    }, 200);
  }, []);

  // ── Handle form submit ──
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedSlot || !token) return;

      if (!formData.name.trim()) {
        setFormError("\u05E0\u05D0 \u05DC\u05DE\u05DC\u05D0 \u05E9\u05DD");
        return;
      }

      setSubmitting(true);
      setFormError(null);

      try {
        const res = await fetch(`/api/p/meetings/${token}/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: selectedSlot.start,
            endTime: selectedSlot.end,
            participantName: formData.name.trim(),
            participantEmail: formData.email.trim() || undefined,
            participantPhone: formData.phone.trim() || undefined,
            notesBefore: formData.notes.trim() || undefined,
            customFieldData:
              Object.keys(formData.customFields).length > 0
                ? formData.customFields
                : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E7\u05D1\u05D9\u05E2\u05EA \u05D4\u05E4\u05D2\u05D9\u05E9\u05D4");
        }

        const result = await res.json();
        setBooking({
          ...result,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
        });
      } catch (err: any) {
        setFormError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [selectedSlot, token, formData]
  );

  // ── Reschedule date range (14 days from today) ──
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

  // ── Fetch slots when reschedule date changes ──
  useEffect(() => {
    if (!rescheduleDate || !token) return;
    setRescheduleSlotsLoading(true);
    setRescheduleSlots([]);
    setRescheduleSlot(null);
    fetch(`/api/p/meetings/${token}/slots?start=${rescheduleDate}&end=${rescheduleDate}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("שגיאה בטעינת המשבצות");
        return res.json();
      })
      .then((data) => setRescheduleSlots(data.slots || []))
      .catch(() => setRescheduleSlots([]))
      .finally(() => setRescheduleSlotsLoading(false));
  }, [rescheduleDate, token]);

  // ── Cancel handler ──
  const handleCancel = useCallback(async () => {
    if (!booking?.manageToken) return;
    setCancelling(true);
    setManageError(null);
    try {
      const res = await fetch(`/api/p/meetings/manage/${booking.manageToken}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "שגיאה בביטול הפגישה");
      }
      setCancelled(true);
    } catch (err: any) {
      setManageError(err.message);
    } finally {
      setCancelling(false);
    }
  }, [booking?.manageToken, cancelReason]);

  // ── Reschedule handler ──
  const handleReschedule = useCallback(async () => {
    if (!booking?.manageToken || !rescheduleSlot) return;
    setRescheduling(true);
    setManageError(null);
    try {
      const res = await fetch(`/api/p/meetings/manage/${booking.manageToken}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: rescheduleSlot.start, endTime: rescheduleSlot.end }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "שגיאה בשינוי המועד");
      }
      const updated = await res.json();
      setBooking((prev) =>
        prev
          ? { ...prev, startTime: updated.startTime || rescheduleSlot.start, endTime: updated.endTime || rescheduleSlot.end }
          : prev
      );
      setShowReschedule(false);
      setRescheduleDate(null);
      setRescheduleSlot(null);
    } catch (err: any) {
      setManageError(err.message);
    } finally {
      setRescheduling(false);
    }
  }, [booking?.manageToken, rescheduleSlot]);

  const slideClass = stepDirection === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  // ── Calendar component (reused in steps 1 & 2) ──
  const calendarElement = (
    <div className="mtg-dark-calendar mtg-fade-in shrink-0">
      <Calendar
        locale={he}
        mode="single"
        selected={selectedDate}
        onSelect={handleDateSelect}
        fromDate={calendarBounds.fromDate}
        toDate={calendarBounds.toDate}
        disabled={disabledDaysMatcher
          ? [{ before: calendarBounds.fromDate, after: calendarBounds.toDate }, disabledDaysMatcher]
          : { before: calendarBounds.fromDate, after: calendarBounds.toDate }
        }
        dir="rtl"
        className="[--cell-size:3rem] sm:[--cell-size:3.5rem]"
        classNames={{
          month_caption: "text-white text-base font-semibold",
          weekday: "text-white/40 text-sm font-medium",
          day: "text-white/80",
        }}
      />
    </div>
  );

  // ─── Render: Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={BG_STYLE}>
        <BackgroundDecor />
        <div className={`${CARD_CLASSES} relative z-10`}>
          <div className="p-6 space-y-4">
            <DarkSkeleton className="h-6 w-48" />
            <div className="flex items-center gap-3">
              <DarkSkeleton className="h-9 w-9 rounded-lg" />
              <DarkSkeleton className="h-4 w-32" />
            </div>
            <DarkSkeleton className="h-4 w-24" />
            <div className="flex flex-col md:flex-row gap-6 mt-4">
              <DarkSkeleton className="h-[280px] w-full md:w-[280px] rounded-xl" />
              <DarkSkeleton className="h-[280px] flex-1 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Error ────────────────────────────────────────────────
  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={BG_STYLE}>
        <BackgroundDecor />
        <div className={`${CARD_CLASSES} p-8 text-center relative z-10`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{"\u05E9\u05D2\u05D9\u05D0\u05D4"}</h2>
          <p className="text-white/50">{error || "\u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05D0\u05D9\u05E0\u05D5 \u05EA\u05E7\u05D9\u05DF \u05D0\u05D5 \u05E9\u05D4\u05E4\u05D2\u05D9\u05E9\u05D4 \u05D0\u05D9\u05E0\u05D4 \u05D6\u05DE\u05D9\u05E0\u05D4"}</p>
        </div>
      </div>
    );
  }

  // ─── Render: Success / Confirmation ────────────────────────────────
  if (booking) {
    // Post-cancel view
    if (cancelled) {
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center p-4" style={BG_STYLE}>
          <BackgroundDecor />
          <div className={`${CARD_CLASSES} p-8 text-center relative z-10`}>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">הפגישה בוטלה</h2>
            <p className="text-white/50 text-sm">הפגישה בוטלה בהצלחה.</p>
            <div className="mt-6 bg-white/[0.08] rounded-xl p-4 space-y-2 text-sm text-white/70">
              <p><span className="font-medium text-white/90">סוג פגישה:</span> {info.name}</p>
              <p><span className="font-medium text-white/90">תאריך מקורי:</span> {formatDate(new Date(booking.startTime))}</p>
            </div>
            <a
              href={`/p/meetings/${token}`}
              className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
            >
              קבעו פגישה חדשה
            </a>
          </div>
        </div>
      );
    }

    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-4" style={BG_STYLE}>
        <BackgroundDecor />
        <div className={`${CARD_CLASSES} p-8 text-center relative z-10`}>
          {!showCancel && !showReschedule && <Confetti />}

          {/* ── Default success view ── */}
          {!showCancel && !showReschedule && (
            <>
              {/* Animated checkmark */}
              <div className="relative w-20 h-20 mx-auto mb-6 mtg-check-scale">
                <svg className="w-20 h-20" viewBox="0 0 60 60">
                  <circle
                    cx="30" cy="30" r="26"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3"
                    strokeDasharray="166"
                    strokeDashoffset="0"
                    style={{ animation: "drawCircle 0.6s ease-out both" }}
                  />
                  <path
                    d="M18 30 L26 38 L42 22"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="48"
                    strokeDashoffset="0"
                    style={{ animation: "drawCheck 0.4s ease-out 0.4s both" }}
                  />
                </svg>
              </div>

              <h2
                className="text-2xl font-bold text-white mb-2 animate-fade-in-up"
                style={{ animationDelay: "0.3s" }}
              >
                !הפגישה נקבעה בהצלחה
              </h2>

              <div
                className="mt-6 bg-white/[0.08] rounded-xl p-4 space-y-2 text-sm text-white/70 animate-fade-in-up"
                style={{ animationDelay: "0.5s" }}
              >
                <p><span className="font-medium text-white/90">סוג פגישה:</span> {info.name}</p>
                <p><span className="font-medium text-white/90">תאריך:</span> {formatDate(new Date(booking.startTime))}</p>
                <p><span className="font-medium text-white/90">שעה:</span> {formatTime(booking.startTime)} - {formatTime(booking.endTime)}</p>
                <p><span className="font-medium text-white/90">משך:</span> {info.duration} דקות</p>
              </div>

              {/* Google Calendar */}
              {(() => {
                const startDt = new Date(booking.startTime);
                const endDt = new Date(booking.endTime);
                const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
                const manageLink = `${window.location.origin}/p/meetings/manage/${booking.manageToken}`;
                const gcalDetails = (info.description ? info.description + "\n\n" : "") + `ניהול הפגישה: ${manageLink}`;
                const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(info.name)}&dates=${fmt(startDt)}/${fmt(endDt)}&details=${encodeURIComponent(gcalDetails)}`;
                return (
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-transparent border border-white/20 text-white/80 rounded-xl font-medium text-sm hover:bg-white/[0.05] transition-colors animate-fade-in-up"
                    style={{ animationDelay: "0.7s" }}
                  >
                    <CalendarDays className="w-4 h-4" />
                    הוסף ליומן Google
                  </a>
                );
              })()}

              {/* Action buttons */}
              <div
                className="mt-4 flex gap-3 animate-fade-in-up"
                style={{ animationDelay: "0.9s" }}
              >
                <button
                  onClick={() => { setShowReschedule(true); setManageError(null); }}
                  className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  שנה מועד
                </button>
                <button
                  onClick={() => { setShowCancel(true); setManageError(null); }}
                  className="flex-1 py-3 px-4 bg-white/[0.08] hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl font-semibold text-sm transition-colors"
                >
                  בטל פגישה
                </button>
              </div>

              {/* Management guide */}
              <div
                className="mt-5 animate-fade-in-up"
                style={{ animationDelay: "1.0s" }}
              >
                <div className="bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-[13px] font-semibold text-white/80">מה הלאה? הפגישה שלכם — השליטה שלכם</span>
                  </div>

                  <div className="p-3 space-y-2">
                    {/* Copy link card */}
                    <button
                      onClick={() => {
                        const manageUrl = `${window.location.origin}/p/meetings/manage/${booking.manageToken}`;
                        navigator.clipboard.writeText(manageUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="w-full group flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-all duration-200 text-right"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${copied ? "bg-green-500/20" : "bg-cyan-500/15 group-hover:bg-cyan-500/25"}`}>
                        {copied ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <Link2 className="w-4 h-4 text-cyan-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold transition-colors ${copied ? "text-green-400" : "text-white/90 group-hover:text-cyan-300"}`}>
                          {copied ? "הקישור הועתק!" : "העתק קישור לניהול"}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">שמרו את הקישור — דרכו תוכלו לנהל את הפגישה מכל מקום</p>
                      </div>
                      <ArrowRight className={`w-4 h-4 mt-1 shrink-0 transition-colors rotate-180 ${copied ? "text-green-400/50" : "text-white/20 group-hover:text-cyan-400"}`} />
                    </button>

                    {/* Reschedule card */}
                    <button
                      onClick={() => { setShowReschedule(true); setManageError(null); }}
                      className="w-full group flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all duration-200 text-right"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0 group-hover:bg-purple-500/25 transition-colors">
                        <RefreshCw className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/90 group-hover:text-purple-300 transition-colors">שנה מועד</p>
                        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">נוצר לכם שינוי בלוח הזמנים? בחרו תאריך ושעה חדשים בלחיצה</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-purple-400 mt-1 shrink-0 transition-colors rotate-180" />
                    </button>

                    {/* Cancel card */}
                    <button
                      onClick={() => { setShowCancel(true); setManageError(null); }}
                      className="w-full group flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200 text-right"
                    >
                      <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0 group-hover:bg-red-500/25 transition-colors">
                        <XCircle className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/90 group-hover:text-red-300 transition-colors">בטל פגישה</p>
                        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">לא מתאים? בטלו בקלות ותוכלו לקבוע מחדש בכל עת</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-red-400 mt-1 shrink-0 transition-colors rotate-180" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Cancel sub-flow ── */}
          {showCancel && (
            <div className="space-y-3 text-right">
              <h3 className="text-lg font-semibold text-white">ביטול פגישה</h3>
              <p className="text-sm text-white/50">
                האם ברצונכם לבטל את הפגישה? ניתן לציין סיבה.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className={`${DARK_INPUT} resize-none`}
                placeholder="סיבת הביטול (אופציונלי)..."
              />
              {manageError && (
                <p className="text-sm text-red-300 bg-red-500/15 border border-red-500/20 rounded-lg px-3 py-2">
                  {manageError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      מבטל...
                    </>
                  ) : (
                    "אישור ביטול"
                  )}
                </button>
                <button
                  onClick={() => { setShowCancel(false); setCancelReason(""); setManageError(null); }}
                  className="py-2.5 px-4 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 border border-white/15 rounded-xl font-medium text-sm transition-colors"
                >
                  חזרה
                </button>
              </div>
            </div>
          )}

          {/* ── Reschedule sub-flow ── */}
          {showReschedule && (
            <div className="space-y-4 text-right">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setShowReschedule(false); setRescheduleDate(null); setRescheduleSlot(null); setManageError(null); }}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  ביטול
                </button>
                <h3 className="text-lg font-semibold text-white">שינוי מועד</h3>
              </div>

              {/* Date grid */}
              <div>
                <p className="text-xs text-white/50 mb-2">בחרו תאריך חדש</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {dateRange.map((d) => {
                    const key = toDateKey(d);
                    const isSelected = rescheduleDate === key;
                    const dayOfWeek = d.getDay();
                    return (
                      <button
                        key={key}
                        onClick={() => setRescheduleDate(key)}
                        className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors ${
                          isSelected
                            ? "bg-purple-600 text-white shadow-sm"
                            : "bg-white/[0.08] hover:bg-white/[0.15] text-white/70 border border-white/10"
                        }`}
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
              {rescheduleDate && (
                <div>
                  <p className="text-xs text-white/50 mb-2">בחרו שעה</p>
                  {rescheduleSlotsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <DarkSkeleton key={i} className="h-10 rounded-xl" />
                      ))}
                    </div>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-center py-4 text-sm text-white/30">
                      אין משבצות פנויות בתאריך זה
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {rescheduleSlots.map((slot) => {
                        const isSelected = rescheduleSlot?.start === slot.start;
                        return (
                          <button
                            key={slot.start}
                            onClick={() => setRescheduleSlot(slot)}
                            className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                              isSelected
                                ? "bg-purple-600 text-white shadow-sm border-purple-600"
                                : "bg-white/[0.08] text-white/70 border-white/10 hover:bg-white/[0.15] hover:border-white/20"
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

              {/* Error */}
              {manageError && (
                <p className="text-sm text-red-300 bg-red-500/15 border border-red-500/20 rounded-lg px-3 py-2">
                  {manageError}
                </p>
              )}

              {/* Confirm reschedule */}
              {rescheduleSlot && (
                <button
                  onClick={handleReschedule}
                  disabled={rescheduling}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {rescheduling ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      מעדכן מועד...
                    </>
                  ) : (
                    `עדכן ל-${formatTime(rescheduleSlot.start)}, ${new Date(
                      rescheduleDate + "T00:00:00"
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
      </div>
    );
  }

  // ─── Render: Booking flow ─────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-start flex-col p-4 pt-8 sm:pt-16 relative" style={BG_STYLE}>
      <BackgroundDecor />

      <div className={`${CARD_CLASSES} relative z-10`}>
        {/* ── TopBar ── */}
        <TopBar name={info.name} color={themeColor} />

        <div className="flex flex-col md:flex-row">
          {/* ── Left Panel ── */}
          <LeftPanel
            info={info}
            themeColor={themeColor}
            selectedDate={currentStep === 3 ? selectedDate : undefined}
            selectedSlot={currentStep === 3 ? selectedSlot : undefined}
          />

          {/* ── Dividers ── */}
          <div className="hidden md:block w-px bg-white/10 self-stretch" />
          <div className="md:hidden h-px bg-white/10" />

          {/* ── Right Panel ── */}
          <div className="flex-1 p-5 overflow-y-auto min-h-[400px]">
            {/* ── Step 1: Calendar + Prompt ── */}
            {currentStep === 1 && (
              <div key="step1" className={slideClass}>
                <div className="flex flex-col lg:flex-row gap-6 items-start">
                  {calendarElement}
                  <div className="hidden lg:flex flex-1 items-center justify-center min-h-[280px]">
                    <p className="text-white/30 text-sm text-center">
                      {"\u05D1\u05D7\u05E8 \u05D9\u05D5\u05DD \u05DB\u05D3\u05D9 \u05DC\u05E8\u05D0\u05D5\u05EA \u05D6\u05DE\u05E0\u05D9\u05DD \u05D6\u05DE\u05D9\u05E0\u05D9\u05DD"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Calendar + Time Slots ── */}
            {currentStep === 2 && (
              <div key="step2" className={slideClass}>
                <div className="flex flex-col lg:flex-row gap-6 items-start">
                  {calendarElement}

                  <div className="flex-1 w-full lg:w-auto lg:min-w-[180px]">
                    {/* Header: date */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white/80">
                        {selectedDate && formatDateShort(selectedDate)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {"\u05E9\u05D9\u05E0\u05D5\u05D9 \u05EA\u05D0\u05E8\u05D9\u05DA"}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    {slotsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <DarkSkeleton key={i} className="h-10 rounded-xl" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="text-center py-8 text-sm text-white/30">
                        <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        {"\u05D0\u05D9\u05DF \u05DE\u05E9\u05D1\u05E6\u05D5\u05EA \u05E4\u05E0\u05D5\u05D9\u05D5\u05EA \u05D1\u05EA\u05D0\u05E8\u05D9\u05DA \u05D6\u05D4"}
                        <br />
                        <button
                          type="button"
                          onClick={() => goToStep(1)}
                          className="mt-2 text-xs text-purple-400 underline hover:no-underline"
                        >
                          {"\u05D1\u05D7\u05E8\u05D5 \u05EA\u05D0\u05E8\u05D9\u05DA \u05D0\u05D7\u05E8"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto mtg-dark-scrollbar pr-1">
                        {slots.map((slot, slotIdx) => {
                          const isSelected = selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={slot.start}
                              onClick={() => handleSlotSelect(slot)}
                              className={`mtg-slide-up py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 border text-center ${
                                isSelected
                                  ? "bg-purple-600 border-purple-600 text-white shadow-sm"
                                  : "bg-[#1a3a2a]/80 border-white/10 text-white/80 hover:bg-white/[0.08] hover:border-white/20"
                              }`}
                              style={{ animationDelay: `${slotIdx * 40}ms` }}
                            >
                              {formatTime(slot.start)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Booking Form ── */}
            {currentStep === 3 && (
              <div key="step3" className={slideClass}>
                <h3 className="text-base font-semibold text-white mb-4">
                  {"\u05D4\u05DE\u05D9\u05D3\u05E2 \u05E9\u05DC\u05DA"}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Name */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      {"\u05E9\u05DD \u05DE\u05DC\u05D0"} <span className="text-red-300">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, name: e.target.value }))
                      }
                      className={DARK_INPUT}
                      placeholder={"\u05D9\u05E9\u05E8\u05D0\u05DC \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9"}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      {"\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC"}
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, email: e.target.value }))
                      }
                      className={DARK_INPUT}
                      placeholder="email@example.com"
                      dir="ltr"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      {"\u05D8\u05DC\u05E4\u05D5\u05DF"}
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, phone: e.target.value }))
                      }
                      className={DARK_INPUT}
                      placeholder="050-1234567"
                      dir="ltr"
                    />
                  </div>

                  {/* Custom fields */}
                  {info.customFields.map((field) => (
                    <div key={field.id}>
                      <label className="block text-xs text-white/50 mb-1">
                        {field.label}
                        {field.required && (
                          <span className="text-red-300"> *</span>
                        )}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          required={field.required}
                          value={formData.customFields[field.id] || ""}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              customFields: {
                                ...p.customFields,
                                [field.id]: e.target.value,
                              },
                            }))
                          }
                          rows={3}
                          className={`${DARK_INPUT} resize-none`}
                          placeholder={field.placeholder || ""}
                        />
                      ) : field.type === "select" ? (
                        <select
                          required={field.required}
                          value={formData.customFields[field.id] || ""}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              customFields: {
                                ...p.customFields,
                                [field.id]: e.target.value,
                              },
                            }))
                          }
                          className={DARK_INPUT}
                        >
                          <option value="">{"\u05D1\u05D7\u05E8\u05D5"}...</option>
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          required={field.required}
                          value={formData.customFields[field.id] || ""}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              customFields: {
                                ...p.customFields,
                                [field.id]: e.target.value,
                              },
                            }))
                          }
                          className={DARK_INPUT}
                          placeholder={field.placeholder || ""}
                          dir={
                            field.type === "email" || field.type === "phone"
                              ? "ltr"
                              : undefined
                          }
                        />
                      )}
                    </div>
                  ))}

                  {/* Notes */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">
                      {"\u05D4\u05E2\u05E8\u05D5\u05EA (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)"}
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, notes: e.target.value }))
                      }
                      rows={3}
                      className={`${DARK_INPUT} resize-none`}
                      placeholder={"\u05D4\u05D5\u05E1\u05D9\u05E4\u05D5 \u05D4\u05E2\u05E8\u05D4 \u05D0\u05D5 \u05D1\u05E7\u05E9\u05D4 \u05DE\u05D9\u05D5\u05D7\u05D3\u05EA..."}
                    />
                  </div>

                  {/* Error */}
                  {formError && (
                    <p className="text-sm text-red-300 bg-red-500/15 border border-red-500/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      className="py-2.5 px-4 border border-white/20 text-white/60 rounded-xl font-medium text-sm hover:bg-white/[0.05] transition-colors"
                    >
                      {"\u05D7\u05D6\u05E8\u05D4"}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                    >
                      {submitting ? (
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
                          {"\u05E7\u05D5\u05D1\u05E2 \u05E4\u05D2\u05D9\u05E9\u05D4..."}
                        </>
                      ) : (
                        "\u05E7\u05D1\u05D9\u05E2\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 text-center">
          <p className="text-xs text-white/20">
            {"\u05DE\u05D5\u05D2\u05E9 \u05D1\u05D0\u05DE\u05E6\u05E2\u05D5\u05EA \u05DE\u05E2\u05E8\u05DB\u05EA BizlyCRM"}
          </p>
        </div>
      </div>
    </div>
  );
}
