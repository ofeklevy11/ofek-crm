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
    <div dir="rtl" className="rounded-2xl border bg-white/80 p-6 relative overflow-hidden">
      {/* Mini weekly overview */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center gap-1 flex-1">
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
                    ? "bg-white shadow-sm border border-gray-200 text-gray-900 font-medium"
                    : "text-gray-400"
                }`}
              >
                <div className="text-[10px] mb-0.5">{DAY_NAMES[idx]}</div>
                {isActive && <div className="text-primary font-bold">{dayHours}h</div>}
              </div>
            );
          })}
        </div>
        <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">
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
            className="px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all duration-200"
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
              className={`flex items-center gap-3 py-3 px-4 rounded-xl border transition-all duration-300 animate-cascade-in ${
                enabled ? "border-r-4 border-r-primary" : ""
              }`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="flex w-20 shrink-0 items-center gap-3">
                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleDay(dayKey)}
                />
                <span className="text-sm font-medium">{DAY_NAMES[idx]}</span>
              </div>

              {enabled ? (
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {schedule[dayKey].map((window, wIdx) => (
                    <div key={wIdx} className="inline-flex items-center gap-1 bg-primary/10 rounded-lg px-2 py-1">
                      <Input
                        type="time"
                        value={window.start}
                        onChange={(e) => updateWindow(dayKey, wIdx, "start", e.target.value)}
                        className="w-24 h-7 text-xs border-0 bg-transparent p-0 focus:ring-0"
                      />
                      <span className="text-xs text-gray-400">-</span>
                      <Input
                        type="time"
                        value={window.end}
                        onChange={(e) => updateWindow(dayKey, wIdx, "end", e.target.value)}
                        className="w-24 h-7 text-xs border-0 bg-transparent p-0 focus:ring-0"
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(dayKey, wIdx)}
                        className="text-gray-400 hover:text-destructive transition-colors p-0.5"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addWindow(dayKey)}
                    className="text-primary text-xs font-medium hover:text-primary/80 transition-colors"
                  >
                    + הוסף
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-400 flex-1">סגור</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky save bar — only when changes detected */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t mt-4 py-3 px-4 -mx-6 -mb-6 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600">יש שינויים שלא נשמרו</span>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`transition-all duration-300 ${saveSuccess ? "animate-pulse-glow" : ""}`}
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
