"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { he } from "date-fns/locale";
import {
  ArrowRight,
  Clock,
  Sun,
  CloudSun,
  Moon,
  CalendarDays,
  FileText,
  Pencil,
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
  availableDays: number[]; // days of week (0=Sun..6=Sat) that have schedule windows
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

function getSlotHour(iso: string) {
  return new Date(iso).getHours();
}

// ─── Skeleton components ─────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`mtg-skeleton-shimmer ${className}`} />;
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 rounded-xl" />
      ))}
    </div>
  );
}

function InfoSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-12 w-12 rounded-full mx-auto" />
      <Skeleton className="h-6 w-48 mx-auto" />
      <Skeleton className="h-4 w-64 mx-auto" />
      <Skeleton className="h-4 w-32 mx-auto" />
    </div>
  );
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

// ─── Step Indicator ──────────────────────────────────────────────────
function StepBar({ current, color, onStepClick }: { current: 1|2|3; color: string; onStepClick: (step: 1|2|3) => void }) {
  const labels = ["\u05EA\u05D0\u05E8\u05D9\u05DA", "\u05E9\u05E2\u05D4", "\u05E4\u05E8\u05D8\u05D9\u05DD"];
  const progress = ((current - 1) / 2) * 100;
  return (
    <div className="py-4 px-6">
      <div className="flex items-center justify-between mb-2">
        {labels.map((label, idx) => {
          const stepNum = (idx + 1) as 1|2|3;
          const isCompleted = current > stepNum;
          const isActive = current === stepNum;
          return (
            <button
              key={stepNum}
              type="button"
              disabled={!isCompleted}
              onClick={() => isCompleted && onStepClick(stepNum)}
              className={`text-xs font-medium transition-colors duration-200 ${
                isActive ? "text-gray-900" : isCompleted ? "text-gray-600 cursor-pointer hover:text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-400 ease-out"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Background style constant ──────────────────────────────────────
const BG_STYLE: React.CSSProperties = {
  background: "radial-gradient(ellipse at top, #e0e7ff22 0%, transparent 50%), #F8FAFC",
};

const CARD_CLASSES = "w-full max-w-[520px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100/80 overflow-hidden";

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
        setBooking(result);
      } catch (err: any) {
        setFormError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [selectedSlot, token, formData]
  );

  // ── Group slots by time of day ──
  const groupedSlots = useMemo(() => {
    const morning: TimeSlot[] = [];
    const afternoon: TimeSlot[] = [];
    const evening: TimeSlot[] = [];

    for (const slot of slots) {
      const hour = getSlotHour(slot.start);
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }

    const groups: { key: string; label: string; icon: React.ReactNode; slots: TimeSlot[] }[] = [];
    if (morning.length > 0) groups.push({ key: "morning", label: "\u05D1\u05D5\u05E7\u05E8", icon: <Sun className="w-4 h-4" />, slots: morning });
    if (afternoon.length > 0) groups.push({ key: "afternoon", label: "\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD", icon: <CloudSun className="w-4 h-4" />, slots: afternoon });
    if (evening.length > 0) groups.push({ key: "evening", label: "\u05E2\u05E8\u05D1", icon: <Moon className="w-4 h-4" />, slots: evening });

    return groups;
  }, [slots]);

  const slideClass = stepDirection === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  // ─── Render: Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]" style={BG_STYLE}>
        <div className={CARD_CLASSES}>
          <InfoSkeleton />
        </div>
      </div>
    );
  }

  // ─── Render: Error ────────────────────────────────────────────────
  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]" style={BG_STYLE}>
        <div className={`${CARD_CLASSES} p-8 text-center`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{"\u05E9\u05D2\u05D9\u05D0\u05D4"}</h2>
          <p className="text-gray-500">{error || "\u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05D0\u05D9\u05E0\u05D5 \u05EA\u05E7\u05D9\u05DF \u05D0\u05D5 \u05E9\u05D4\u05E4\u05D2\u05D9\u05E9\u05D4 \u05D0\u05D9\u05E0\u05D4 \u05D6\u05DE\u05D9\u05E0\u05D4"}</p>
        </div>
      </div>
    );
  }

  // ─── Render: Success / Confirmation ────────────────────────────────
  if (booking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]" style={BG_STYLE}>
        <div className={`${CARD_CLASSES} p-8 text-center relative`}>
          <Confetti />

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
            className="text-2xl font-bold text-gray-900 mb-2 animate-fade-in-up"
            style={{ animationDelay: "0.3s" }}
          >
            !{"\u05D4\u05E4\u05D2\u05D9\u05E9\u05D4 \u05E0\u05E7\u05D1\u05E2\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4"}
          </h2>

          <div
            className="mt-6 bg-[#F8FAFC] rounded-xl p-4 space-y-2 text-sm text-gray-700 animate-fade-in-up"
            style={{ animationDelay: "0.5s" }}
          >
            <p>
              <span className="font-medium">{"\u05E1\u05D5\u05D2 \u05E4\u05D2\u05D9\u05E9\u05D4"}:</span> {info.name}
            </p>
            <p>
              <span className="font-medium">{"\u05EA\u05D0\u05E8\u05D9\u05DA"}:</span>{" "}
              {formatDate(new Date(booking.startTime))}
            </p>
            <p>
              <span className="font-medium">{"\u05E9\u05E2\u05D4"}:</span>{" "}
              {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
            </p>
            <p>
              <span className="font-medium">{"\u05DE\u05E9\u05DA"}:</span> {info.duration} {"\u05D3\u05E7\u05D5\u05EA"}
            </p>
          </div>

          <a
            href={`/p/meetings/manage/${booking.manageToken}`}
            className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 px-4 text-white rounded-xl font-semibold transition-colors animate-fade-in-up"
            style={{ backgroundColor: themeColor, animationDelay: "0.7s" }}
          >
            {"\u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E4\u05D2\u05D9\u05E9\u05D4"}
          </a>

          {(() => {
            const startDt = new Date(booking.startTime);
            const endDt = new Date(booking.endTime);
            const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
            const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(info.name)}&dates=${fmt(startDt)}/${fmt(endDt)}&details=${encodeURIComponent(info.description || "")}`;
            return (
              <a
                href={gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors animate-fade-in-up"
                style={{ animationDelay: "0.9s" }}
              >
                <CalendarDays className="w-4 h-4" />
                {"\u05D4\u05D5\u05E1\u05E3 \u05DC\u05D9\u05D5\u05DE\u05DF Google"}
              </a>
            );
          })()}

          <p
            className="mt-3 text-xs text-gray-400 animate-fade-in-up"
            style={{ animationDelay: "1.0s" }}
          >
            {"\u05E9\u05DE\u05E8\u05D5 \u05D0\u05EA \u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E4\u05D2\u05D9\u05E9\u05D4 - \u05D1\u05D9\u05D8\u05D5\u05DC \u05D5\u05E9\u05D9\u05E0\u05D5\u05D9 \u05DE\u05D5\u05E2\u05D3"}
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: Booking flow ─────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-start flex-col p-4 pt-8 sm:pt-16 bg-[#F8FAFC]" style={BG_STYLE}>
      <div className={CARD_CLASSES}>
        {/* ── Color accent bar ── */}
        <div className="h-1" style={{ backgroundColor: themeColor }} />

        {/* ── Header / Branding ── */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            {info.company.logoUrl ? (
              <img
                src={info.company.logoUrl}
                alt={info.company.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: themeColor }}
              >
                {info.company.name.charAt(0)}
              </div>
            )}
            <span className="text-sm text-gray-500">{info.company.name}</span>
          </div>

          <h1 className="text-xl font-bold text-gray-900">{info.name}</h1>
          {info.description && (
            <p className="text-sm text-gray-500 mt-1">{info.description}</p>
          )}

          {/* Info chips row */}
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 rounded-full px-2.5 py-1 text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              {info.duration} {"\u05D3\u05E7\u05D5\u05EA"}
            </span>
          </div>
        </div>

        {/* ── Step Progress Bar ── */}
        <StepBar current={currentStep} color={themeColor} onStepClick={goToStep} />

        <div className="px-6 pb-6">
          {/* ── Step 1: Calendar ── */}
          {currentStep === 1 && (
            <div key="step1" className={slideClass}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {"\u05D1\u05D7\u05E8\u05D5 \u05EA\u05D0\u05E8\u05D9\u05DA"}
              </h3>
              <div key={selectedDate?.getMonth()} className="flex justify-center mtg-fade-in">
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
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Time Slots ── */}
          {currentStep === 2 && (
            <div key="step2" className={slideClass}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {selectedDate && formatDate(selectedDate)}
                </h3>
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {"\u05E9\u05D9\u05E0\u05D5\u05D9 \u05EA\u05D0\u05E8\u05D9\u05DA"}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {slotsLoading ? (
                <SlotsSkeleton />
              ) : slots.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {"\u05D0\u05D9\u05DF \u05DE\u05E9\u05D1\u05E6\u05D5\u05EA \u05E4\u05E0\u05D5\u05D9\u05D5\u05EA \u05D1\u05EA\u05D0\u05E8\u05D9\u05DA \u05D6\u05D4"}
                  <br />
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="mt-2 text-xs underline hover:no-underline"
                    style={{ color: themeColor }}
                  >
                    {"\u05D1\u05D7\u05E8\u05D5 \u05EA\u05D0\u05E8\u05D9\u05DA \u05D0\u05D7\u05E8"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedSlots.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500">
                        {group.icon}
                        {group.label}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {group.slots.map((slot, slotIdx) => {
                          const isSelected = selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={slot.start}
                              onClick={() => handleSlotSelect(slot)}
                              className={`mtg-slide-up py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                                isSelected
                                  ? "text-white shadow-sm"
                                  : "border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
                              }`}
                              style={{
                                animationDelay: `${slotIdx * 40}ms`,
                                ...(isSelected ? { backgroundColor: themeColor, borderColor: themeColor } : {}),
                              }}
                            >
                              {formatTime(slot.start)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 mt-3 text-center">{"\u05E9\u05E2\u05D5\u05DF \u05D9\u05E9\u05E8\u05D0\u05DC (Asia/Jerusalem)"}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Booking Form + Summary ── */}
          {currentStep === 3 && (
            <div key="step3" className={slideClass}>
              {/* Summary card */}
              <div
                className="rounded-xl p-4 mb-5 border-2"
                style={{ borderColor: `${themeColor}40`, backgroundColor: `${themeColor}08` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: themeColor }}
                    />
                    <span className="text-sm font-semibold text-gray-800">{info.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {"\u05E9\u05D9\u05E0\u05D5\u05D9"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {selectedDate && formatDate(selectedDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {selectedSlot && `${formatTime(selectedSlot.start)} - ${formatTime(selectedSlot.end)}`}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
                  >
                    {info.duration} {"\u05D3\u05E7\u05D5\u05EA"}
                  </span>
                </div>
              </div>

              {/* Back button */}
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-3"
              >
                {"\u05E9\u05D9\u05E0\u05D5\u05D9 \u05E9\u05E2\u05D4"}
                <ArrowRight className="w-3 h-3" />
              </button>

              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {"\u05E4\u05E8\u05D8\u05D9 \u05D4\u05DE\u05E9\u05EA\u05EA\u05E3"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {"\u05E9\u05DD \u05DE\u05DC\u05D0"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200"
                    style={{ "--tw-ring-color": themeColor } as React.CSSProperties}
                    placeholder={"\u05D9\u05E9\u05E8\u05D0\u05DC \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9"}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {"\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC"}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200"
                    style={{ "--tw-ring-color": themeColor } as React.CSSProperties}
                    placeholder="email@example.com"
                    dir="ltr"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {"\u05D8\u05DC\u05E4\u05D5\u05DF"}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200"
                    style={{ "--tw-ring-color": themeColor } as React.CSSProperties}
                    placeholder="050-1234567"
                    dir="ltr"
                  />
                </div>

                {/* Custom fields */}
                {info.customFields.map((field) => (
                  <div key={field.id}>
                    <label className="block text-xs text-gray-500 mb-1">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500"> *</span>
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
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none transition-shadow duration-200"
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
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white transition-shadow duration-200"
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
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200"
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
                  <label className="block text-xs text-gray-500 mb-1">
                    {"\u05D4\u05E2\u05E8\u05D5\u05EA (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)"}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, notes: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none transition-shadow duration-200"
                    placeholder={"\u05D4\u05D5\u05E1\u05D9\u05E4\u05D5 \u05D4\u05E2\u05E8\u05D4 \u05D0\u05D5 \u05D1\u05E7\u05E9\u05D4 \u05DE\u05D9\u05D5\u05D7\u05D3\u05EA..."}
                  />
                </div>

                {/* Error */}
                {formError && (
                  <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
                  style={{ backgroundColor: themeColor }}
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
                    "\u05E7\u05D1\u05E2 \u05E4\u05D2\u05D9\u05E9\u05D4"
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            {"\u05DE\u05D5\u05D2\u05E9 \u05D1\u05D0\u05DE\u05E6\u05E2\u05D5\u05EA \u05DE\u05E2\u05E8\u05DB\u05EA COOL CRM"}
          </p>
        </div>
      </div>
    </div>
  );
}
