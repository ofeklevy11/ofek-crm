"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2, Save, Check } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"];

interface TimeWindow {
  start: string;
  end: string;
}

interface AvailabilityEditorProps {
  initialData: {
    weeklySchedule: Record<string, TimeWindow[]>;
    timezone: string;
  };
  onSave: (data: {
    weeklySchedule: Record<string, TimeWindow[]>;
    timezone: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

const PRESETS = [
  { label: "עסקי רגיל 9-17", days: ["0", "1", "2", "3", "4"], start: "09:00", end: "17:00" },
  { label: "בוקר 7-14", days: ["0", "1", "2", "3", "4"], start: "07:00", end: "14:00" },
  { label: "ערב 16-22", days: ["0", "1", "2", "3", "4"], start: "16:00", end: "22:00" },
];

export default function AvailabilityEditor({
  initialData,
  onSave,
}: AvailabilityEditorProps) {
  const [schedule, setSchedule] = useState<Record<string, TimeWindow[]>>(
    () => {
      const cloned: Record<string, TimeWindow[]> = {};
      for (const key of DAY_KEYS) {
        const windows = initialData.weeklySchedule[key];
        cloned[key] = windows
          ? windows.map((w) => ({ start: w.start, end: w.end }))
          : [];
      }
      return cloned;
    }
  );
  const [timezone] = useState(initialData.timezone);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const isDayEnabled = useCallback(
    (day: string) => schedule[day].length > 0,
    [schedule]
  );

  const toggleDay = useCallback((day: string) => {
    setSchedule((prev) => {
      const windows = prev[day];
      if (windows.length > 0) {
        return { ...prev, [day]: [] };
      }
      return { ...prev, [day]: [{ start: "09:00", end: "17:00" }] };
    });
  }, []);

  const addWindow = useCallback((day: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "09:00", end: "17:00" }],
    }));
  }, []);

  const removeWindow = useCallback((day: string, index: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  }, []);

  const updateWindow = useCallback(
    (day: string, index: number, field: "start" | "end", value: string) => {
      setSchedule((prev) => ({
        ...prev,
        [day]: prev[day].map((w, i) =>
          i === index ? { ...w, [field]: value } : w
        ),
      }));
    },
    []
  );

  const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
    setSchedule((prev) => {
      const next = { ...prev };
      for (const key of DAY_KEYS) {
        if (preset.days.includes(key)) {
          next[key] = [{ start: preset.start, end: preset.end }];
        } else {
          next[key] = [];
        }
      }
      return next;
    });
    setAnimKey((k) => k + 1);
  }, []);

  const summary = useMemo(() => {
    let totalMinutes = 0;
    let activeDays = 0;
    for (const key of DAY_KEYS) {
      const windows = schedule[key];
      if (windows.length > 0) {
        activeDays++;
        for (const w of windows) {
          const [sh, sm] = w.start.split(":").map(Number);
          const [eh, em] = w.end.split(":").map(Number);
          totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
        }
      }
    }
    const hours = Math.round(totalMinutes / 60 * 10) / 10;
    return { hours, activeDays };
  }, [schedule]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(schedule) !== JSON.stringify(
      (() => {
        const cloned: Record<string, TimeWindow[]> = {};
        for (const key of DAY_KEYS) {
          const windows = initialData.weeklySchedule[key];
          cloned[key] = windows ? windows.map(w => ({ start: w.start, end: w.end })) : [];
        }
        return cloned;
      })()
    );
  }, [schedule, initialData.weeklySchedule]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await onSave({ weeklySchedule: schedule, timezone });
      if (result.success) {
        toast.success("הזמינות נשמרה בהצלחה");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1500);
      } else {
        toast.error(result.error || "שגיאה בשמירת הזמינות");
      }
    } catch {
      toast.error("שגיאה בשמירת הזמינות");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="rounded-2xl border border-white/20 bg-[#162e22] backdrop-blur-sm p-6 relative overflow-hidden">
      {/* Mini weekly overview */}
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex items-center gap-1">
          {DAY_KEYS.map((dayKey, idx) => {
            const windows = schedule[dayKey];
            const dayMinutes = windows.reduce((sum, w) => {
              const [sh, sm] = w.start.split(":").map(Number);
              const [eh, em] = w.end.split(":").map(Number);
              return sum + ((eh * 60 + em) - (sh * 60 + sm));
            }, 0);
            const dayHours = Math.round(dayMinutes / 60 * 10) / 10;
            const isActive = windows.length > 0;
            return (
              <div
                key={dayKey}
                className={`flex-1 text-center py-2 rounded-lg text-xs transition-all ${
                  isActive
                    ? "bg-white/[0.08] border border-white/20 text-white font-medium"
                    : "text-white/50"
                }`}
              >
                <div className="text-xs mb-0.5">{DAY_NAMES[idx]}</div>
                {isActive && <div className="text-blue-400 font-bold">{dayHours}h</div>}
              </div>
            );
          })}
        </div>
        <div className="self-start bg-blue-500/15 text-blue-400 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
          {summary.hours} שעות/שבוע
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="px-3 py-1.5 rounded-full border border-white/20 text-sm font-medium text-white/80 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-400 transition-all duration-200"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Day rows */}
      <div className="space-y-3" key={animKey}>
        {DAY_KEYS.map((dayKey, idx) => {
          const enabled = isDayEnabled(dayKey);
          return (
            <div
              key={dayKey}
              className={`flex items-start gap-3 py-3 px-4 rounded-xl border border-white/20 transition-all duration-300 animate-cascade-in ${
                enabled ? "border-r-4 border-r-blue-500" : ""
              }`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <span className="text-sm font-medium text-white shrink-0 w-12 text-start mt-1.5">{DAY_NAMES[idx]}</span>

              {enabled ? (
                <div className="flex flex-col items-center sm:items-start sm:flex-row gap-2 flex-wrap flex-1 min-h-0">
                  {schedule[dayKey].map((window, wIdx) => (
                    <div key={wIdx} className="inline-flex items-center gap-1 bg-blue-500/10 rounded-lg px-2 py-1">
                      <Input
                        type="time"
                        value={window.start}
                        onChange={(e) => updateWindow(dayKey, wIdx, "start", e.target.value)}
                        className="w-24 h-7 text-xs border-0 bg-transparent p-0 focus:ring-0 text-white"
                        aria-label={`שעת התחלה יום ${DAY_NAMES[idx]}`}
                      />
                      <span className="text-xs text-white/50" aria-hidden="true">-</span>
                      <Input
                        type="time"
                        value={window.end}
                        onChange={(e) => updateWindow(dayKey, wIdx, "end", e.target.value)}
                        className="w-24 h-7 text-xs border-0 bg-transparent p-0 focus:ring-0 text-white"
                        aria-label={`שעת סיום יום ${DAY_NAMES[idx]}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(dayKey, wIdx)}
                        className="text-white/50 hover:text-red-400 transition-colors p-0.5"
                        aria-label="הסר חלון זמן"
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addWindow(dayKey)}
                    className="text-blue-400 text-sm font-medium hover:text-blue-300 transition-colors"
                  >
                    + הוסף
                  </button>
                </div>
              ) : (
                <span className="text-sm text-white/50 flex-1 text-center sm:text-start mt-1">סגור</span>
              )}

              <Switch
                checked={enabled}
                onCheckedChange={() => toggleDay(dayKey)}
                className="shrink-0 mt-1.5"
                aria-label={`${DAY_NAMES[idx]} - ${enabled ? "פעיל" : "לא פעיל"}`}
              />
            </div>
          );
        })}
      </div>

      {/* Sticky save bar — only when changes detected */}
      {hasChanges && (
        <div role="status" className="sticky bottom-0 bg-[#162e22] backdrop-blur-sm border-t border-white/20 mt-4 py-3 px-4 -mx-6 -mb-6 flex items-center justify-between gap-3">
          <span className="text-sm text-white/60">יש שינויים שלא נשמרו</span>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`bg-blue-600 hover:bg-blue-700 transition-all duration-300 ${saveSuccess ? "animate-pulse-glow" : ""}`}
          >
            {saveSuccess ? (
              <><Check className="size-4" /> נשמר!</>
            ) : (
              <><Save className="size-4" /> {saving ? "שומר..." : "שמור זמינות"}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
