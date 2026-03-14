"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Check, Plus, Trash2, ArrowLeft, ArrowRight, FileText, Clock, Shield, Sparkles } from "lucide-react";

interface CustomFieldDef {
  id: string;
  label: string;
  type: "text" | "number" | "email" | "phone" | "select" | "textarea";
  required: boolean;
  options: string[];
}

interface MeetingTypeModalProps {
  open: boolean;
  onClose: () => void;
  meetingType?: {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    duration: number;
    color?: string | null;
    bufferBefore: number;
    bufferAfter: number;
    dailyLimit?: number | null;
    minAdvanceHours: number;
    maxAdvanceDays: number;
    customFields: any[];
    isActive: boolean;
  } | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

const DURATION_OPTIONS = [
  { value: "15", label: "15 דקות" },
  { value: "30", label: "30 דקות" },
  { value: "45", label: "45 דקות" },
  { value: "60", label: "60 דקות" },
  { value: "90", label: "90 דקות" },
  { value: "120", label: "120 דקות" },
];

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "טקסט" },
  { value: "number", label: "מספר" },
  { value: "email", label: "אימייל" },
  { value: "phone", label: "טלפון" },
  { value: "select", label: "בחירה" },
  { value: "textarea", label: "טקסט ארוך" },
];

const STEPS = [
  { label: "מידע בסיסי", icon: FileText },
  { label: "תזמון", icon: Clock },
  { label: "מגבלות", icon: Shield },
  { label: "שדות מותאמים", icon: Sparkles },
];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function createEmptyField(): CustomFieldDef {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "text",
    required: false,
    options: [],
  };
}

/* ── Confetti burst (reused pattern from booking page) ── */
function ConfettiBurst() {
  const pieces = useMemo(() => {
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];
    return Array.from({ length: 15 }, (_, i) => {
      const angle = (Math.random() * 360) * (Math.PI / 180);
      const dist = 60 + Math.random() * 100;
      return {
        id: i,
        color: colors[i % colors.length],
        cx: `${Math.cos(angle) * dist}px`,
        cy: `${Math.sin(angle) * dist - 40}px`,
        cr: `${Math.random() * 360}deg`,
        size: 6 + Math.random() * 6,
        delay: Math.random() * 0.15,
      };
    });
  }, []);

  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `confettiBurst 0.5s ease-out ${p.delay}s forwards`,
            "--cx": p.cx,
            "--cy": p.cy,
            "--cr": p.cr,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ── StepBar ── */
function StepBar({
  current,
  color,
  onGoTo,
}: {
  current: number;
  color: string;
  onGoTo: (step: number) => void;
}) {
  return (
    <nav aria-label="שלבי האשף" className="flex items-center justify-center gap-0 py-3 px-4">
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;
        const isFuture = stepNum > current;
        const StepIcon = step.icon;

        return (
          <div key={idx} className="flex items-center">
            {idx > 0 && (
              <div
                className="w-8 sm:w-12 h-0.5 transition-colors duration-300"
                style={{ backgroundColor: isCompleted || isActive ? color : "#e2e8f0" }}
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => isCompleted && onGoTo(stepNum)}
              disabled={isFuture}
              className="flex flex-col items-center gap-1 group"
              aria-current={isActive ? "step" : undefined}
              aria-label={`שלב ${stepNum}: ${step.label}`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  isActive ? "scale-105 shadow-sm" : ""
                } ${isCompleted ? "cursor-pointer" : ""} ${isFuture ? "cursor-default" : ""}`}
                style={{
                  backgroundColor: isCompleted ? "#22c55e" : isActive ? color : "transparent",
                  color: isCompleted || isActive ? "white" : "#94a3b8",
                  border: isFuture ? "2px solid #e2e8f0" : isActive ? `2px solid ${color}` : "2px solid #22c55e",
                }}
              >
                {isCompleted ? (
                  <Check className="size-4" />
                ) : (
                  <StepIcon className="size-4" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors hidden sm:block ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

/* ── Live Preview ── */
function LivePreview({
  form,
  customFields,
  wizardStep,
}: {
  form: {
    name: string;
    description: string;
    duration: string;
    color: string;
    bufferBefore: number;
    bufferAfter: number;
    dailyLimit: number;
    minAdvanceHours: number;
    maxAdvanceDays: number;
    isActive: boolean;
  };
  customFields: CustomFieldDef[];
  wizardStep: number;
}) {
  const durationLabel = DURATION_OPTIONS.find((d) => d.value === form.duration)?.label || form.duration + " דקות";

  return (
    <div className="h-full flex flex-col p-4">
      <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">תצוגה מקדימה</p>
      <div className="flex-1 flex items-start justify-center">
        <div className="w-full rounded-xl border bg-white shadow-sm overflow-hidden animate-scale-in">
          {/* Color accent bar */}
          <div className="h-1 w-full" style={{ backgroundColor: form.color }} />

          <div className="p-4 space-y-3">
            {/* Company icon + name */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: form.color }}
              >
                {form.name?.charAt(0) || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">
                  {form.name || "שם סוג הפגישה"}
                </p>
                {form.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {form.description}
                  </p>
                )}
              </div>
            </div>

            {/* Duration badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: form.color }}
              >
                <Clock className="size-3" />
                {durationLabel}
              </span>
              {!form.isActive && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                  לא פעיל
                </span>
              )}
            </div>

            {/* Step 2: Buffer indicators */}
            {wizardStep >= 2 && (form.bufferBefore > 0 || form.bufferAfter > 0) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in-up">
                <Clock className="size-3" />
                <span>
                  {form.bufferBefore > 0 && `${form.bufferBefore} דק׳ לפני`}
                  {form.bufferBefore > 0 && form.bufferAfter > 0 && " | "}
                  {form.bufferAfter > 0 && `${form.bufferAfter} דק׳ אחרי`}
                </span>
              </div>
            )}

            {/* Step 3: Constraints summary */}
            {wizardStep >= 3 && (
              <div className="space-y-1 text-xs text-muted-foreground animate-fade-in-up">
                {form.dailyLimit > 0 && (
                  <div className="flex items-center gap-1">
                    <Shield className="size-3" />
                    <span>מגבלה יומית: {form.dailyLimit}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Shield className="size-3" />
                  <span>הזמנה: {form.minAdvanceHours} שעות — {form.maxAdvanceDays} ימים</span>
                </div>
              </div>
            )}

            {/* Step 4: Custom fields preview */}
            {wizardStep >= 4 && customFields.filter((f) => f.label.trim()).length > 0 && (
              <div className="border-t pt-3 space-y-2 animate-fade-in-up">
                <p className="text-[10px] text-muted-foreground font-medium">שדות טופס</p>
                {customFields
                  .filter((f) => f.label.trim())
                  .map((field) => (
                    <div key={field.id} className="space-y-0.5">
                      <label className="text-xs font-medium">
                        {field.label}
                        {field.required && <span className="text-red-500 mr-0.5">*</span>}
                      </label>
                      <div className="h-7 rounded-md border bg-gray-50" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MeetingTypeModal({
  open,
  onClose,
  meetingType,
  onSave,
}: MeetingTypeModalProps) {
  const [saving, setSaving] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [stepDirection, setStepDirection] = useState<"forward" | "back">("forward");
  const [showConfetti, setShowConfetti] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    duration: "30",
    color: "#6366F1",
    bufferBefore: 0,
    bufferAfter: 0,
    dailyLimit: 0,
    minAdvanceHours: 1,
    maxAdvanceDays: 30,
    isActive: true,
  });
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [optionsText, setOptionsText] = useState<Record<string, string>>({});
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const shouldFocusStep = useRef(false);

  useEffect(() => {
    if (open) {
      setWizardStep(1);
      setStepDirection("forward");
      setShowConfetti(false);
      setForm({
        name: meetingType?.name ?? "",
        slug: meetingType?.slug ?? "",
        description: meetingType?.description ?? "",
        duration: String(meetingType?.duration ?? 30),
        color: meetingType?.color ?? "#6366F1",
        bufferBefore: meetingType?.bufferBefore ?? 0,
        bufferAfter: meetingType?.bufferAfter ?? 0,
        dailyLimit: meetingType?.dailyLimit ?? 0,
        minAdvanceHours: meetingType?.minAdvanceHours ?? 1,
        maxAdvanceDays: meetingType?.maxAdvanceDays ?? 30,
        isActive: meetingType?.isActive ?? true,
      });
      const fields = (meetingType?.customFields || []).map((f: any) => ({
        id: f.id || crypto.randomUUID(),
        label: f.label || "",
        type: f.type || "text",
        required: f.required ?? false,
        options: f.options || [],
      }));
      setCustomFields(fields);
      setOptionsText(
        Object.fromEntries(fields.map((f) => [f.id, f.options.join(", ")]))
      );
    }
  }, [open, meetingType]);

  useEffect(() => {
    if (shouldFocusStep.current) {
      shouldFocusStep.current = false;
      requestAnimationFrame(() => {
        stepContainerRef.current?.focus();
      });
    }
  }, [wizardStep]);

  const handleNameChange = (value: string) => {
    const slug = meetingType ? form.slug : generateSlug(value);
    setForm((prev) => ({ ...prev, name: value, slug }));
  };

  const addCustomField = useCallback(() => {
    const field = createEmptyField();
    setCustomFields((prev) => [...prev, field]);
    setOptionsText((prev) => ({ ...prev, [field.id]: "" }));
  }, []);

  const updateCustomField = useCallback(
    (index: number, key: keyof CustomFieldDef, value: any) => {
      setCustomFields((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], [key]: value };
        return copy;
      });
    },
    []
  );

  const removeCustomField = useCallback((index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const goNext = () => {
    if (wizardStep < 4) {
      shouldFocusStep.current = true;
      setStepDirection("forward");
      setWizardStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (wizardStep > 1) {
      shouldFocusStep.current = true;
      setStepDirection("back");
      setWizardStep((s) => s - 1);
    }
  };

  const goTo = (step: number) => {
    shouldFocusStep.current = true;
    setStepDirection(step > wizardStep ? "forward" : "back");
    setWizardStep(step);
  };

  const canProceed = wizardStep === 1 ? form.name.trim().length > 0 : true;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        duration: Number(form.duration),
        color: form.color,
        bufferBefore: form.bufferBefore,
        bufferAfter: form.bufferAfter,
        dailyLimit: form.dailyLimit || null,
        minAdvanceHours: form.minAdvanceHours,
        maxAdvanceDays: form.maxAdvanceDays,
        isActive: form.isActive,
        customFields: customFields
          .filter((f) => f.label.trim())
          .map((f) => ({
            ...f,
            options: f.type === "select"
              ? (optionsText[f.id] ?? f.options.join(", "))
                  .split(",").map((s) => s.trim()).filter(Boolean)
              : f.options,
          })),
      });
      if (!meetingType) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  const slideClass = stepDirection === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
      >
        {showConfetti && <ConfettiBurst />}

        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>
            {meetingType ? "עריכת סוג פגישה" : "סוג פגישה חדש"}
          </DialogTitle>
        </DialogHeader>

        {/* Step Bar */}
        <StepBar current={wizardStep} color={form.color} onGoTo={goTo} />

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
              e.preventDefault();
            }
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex flex-1 overflow-hidden">
            {/* ── Form Column (60%) ── */}
            <div className="flex-1 sm:w-[60%] overflow-y-auto px-6 pb-4">
              {/* Step 1: Basic Info */}
              {wizardStep === 1 && (
                <div key="step1" className={slideClass} ref={stepContainerRef} tabIndex={-1}>
                  <div className="space-y-4">
                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "0ms" }}>
                      <Label htmlFor="mt-name">שם *</Label>
                      <Input
                        id="mt-name"
                        value={form.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="למשל: פגישת ייעוץ"
                        required
                      />
                    </div>

                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "55ms" }}>
                      <Label htmlFor="mt-slug">slug</Label>
                      <Input
                        id="mt-slug"
                        dir="ltr"
                        value={form.slug}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, slug: e.target.value }))
                        }
                        placeholder="consultation"
                        className="text-left"
                      />
                    </div>

                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "110ms" }}>
                      <Label htmlFor="mt-desc">תיאור</Label>
                      <Textarea
                        id="mt-desc"
                        value={form.description}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="תיאור קצר של סוג הפגישה..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "170ms" }}>
                      <Label>צבע</Label>
                      <ColorPicker
                        value={form.color}
                        onChange={(c) => setForm((p) => ({ ...p, color: c }))}
                        label="צבע סוג הפגישה"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 animate-cascade-in" style={{ animationDelay: "225ms" }}>
                      <Label htmlFor="mt-active">פעיל</Label>
                      <Switch
                        id="mt-active"
                        checked={form.isActive}
                        onCheckedChange={(checked) =>
                          setForm((prev) => ({ ...prev, isActive: checked }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Timing */}
              {wizardStep === 2 && (
                <div key="step2" className={slideClass} ref={stepContainerRef} tabIndex={-1}>
                  <div className="space-y-4">
                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "0ms" }}>
                      <Label>משך</Label>
                      <Select
                        value={form.duration}
                        onValueChange={(v) =>
                          setForm((prev) => ({ ...prev, duration: v }))
                        }
                      >
                        <SelectTrigger aria-label="משך הפגישה">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4 animate-cascade-in" style={{ animationDelay: "55ms" }}>
                      <div className="space-y-1.5">
                        <Label htmlFor="mt-buf-before">חציצה לפני (דקות)</Label>
                        <Input
                          id="mt-buf-before"
                          type="number"
                          min={0}
                          max={120}
                          value={form.bufferBefore}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              bufferBefore: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="mt-buf-after">חציצה אחרי (דקות)</Label>
                        <Input
                          id="mt-buf-after"
                          type="number"
                          min={0}
                          max={120}
                          value={form.bufferAfter}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              bufferAfter: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Constraints */}
              {wizardStep === 3 && (
                <div key="step3" className={slideClass} ref={stepContainerRef} tabIndex={-1}>
                  <div className="space-y-4">
                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "0ms" }}>
                      <Label htmlFor="mt-limit">מגבלה יומית (0 = ללא הגבלה)</Label>
                      <Input
                        id="mt-limit"
                        type="number"
                        min={0}
                        value={form.dailyLimit}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            dailyLimit: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "55ms" }}>
                      <Label htmlFor="mt-min-adv">זמן מינימלי מראש (שעות)</Label>
                      <Input
                        id="mt-min-adv"
                        type="number"
                        min={0}
                        value={form.minAdvanceHours}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            minAdvanceHours: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5 animate-cascade-in" style={{ animationDelay: "110ms" }}>
                      <Label htmlFor="mt-max-adv">ימי הזמנה מקסימליים</Label>
                      <Input
                        id="mt-max-adv"
                        type="number"
                        min={1}
                        value={form.maxAdvanceDays}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            maxAdvanceDays: Number(e.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Custom Fields */}
              {wizardStep === 4 && (
                <div key="step4" className={slideClass} ref={stepContainerRef} tabIndex={-1}>
                  <div className="space-y-3">
                    {customFields.map((field, idx) => (
                      <div
                        key={field.id}
                        className="border border-border rounded-lg p-3 space-y-2 animate-cascade-in"
                        style={{ animationDelay: `${idx * 55}ms` }}
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            value={field.label}
                            onChange={(e) =>
                              updateCustomField(idx, "label", e.target.value)
                            }
                            placeholder="שם השדה"
                            aria-label={`שם שדה ${idx + 1}`}
                            className="flex-1 h-8 text-sm"
                          />
                          <Select
                            value={field.type}
                            onValueChange={(v) =>
                              updateCustomField(idx, "type", v)
                            }
                          >
                            <SelectTrigger className="w-28 h-8 text-xs" aria-label={`סוג שדה ${field.label || idx + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) =>
                                updateCustomField(idx, "required", checked)
                              }
                              className="scale-75"
                              aria-label={`${field.label || `שדה ${idx + 1}`} - שדה חובה`}
                            />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              חובה
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive/80 shrink-0"
                            onClick={() => removeCustomField(idx)}
                            aria-label={`הסר שדה ${field.label || idx + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        </div>

                        {field.type === "select" && (
                          <div>
                            <label className="text-[10px] text-muted-foreground" htmlFor={`mt-cf-options-${field.id}`}>
                              אפשרויות (מופרדות בפסיק)
                            </label>
                            <Input
                              id={`mt-cf-options-${field.id}`}
                              value={optionsText[field.id] ?? field.options.join(", ")}
                              onChange={(e) =>
                                setOptionsText((prev) => ({ ...prev, [field.id]: e.target.value }))
                              }
                              onBlur={() => {
                                const parsed = (optionsText[field.id] ?? "")
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                updateCustomField(idx, "options", parsed);
                              }}
                              placeholder="אפשרות 1, אפשרות 2, אפשרות 3"
                              className="h-8 text-xs mt-1"
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={addCustomField}
                    >
                      <Plus className="w-3.5 h-3.5 ml-1" />
                      הוסף שדה
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Preview Column (40%) ── */}
            <div className="hidden sm:block sm:w-[40%] border-r bg-muted/30 overflow-y-auto">
              <LivePreview form={form} customFields={customFields} wizardStep={wizardStep} />
            </div>
          </div>

          {/* ── Navigation Footer ── */}
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <div>
              {wizardStep > 1 && (
                <Button type="button" variant="ghost" onClick={goBack} className="gap-1.5">
                  <ArrowRight className="size-4" />
                  חזרה
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                ביטול
              </Button>

              {wizardStep < 4 ? (
                <Button
                  type="button"
                  disabled={!canProceed}
                  onClick={goNext}
                  className="gap-1.5"
                  style={{ backgroundColor: form.color, borderColor: form.color }}
                >
                  הבא
                  <ArrowLeft className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={saving || !form.name.trim()}
                  style={{ backgroundColor: form.color, borderColor: form.color }}
                >
                  {saving ? (
                    <>
                      <Spinner size="sm" />
                      שומר...
                    </>
                  ) : meetingType ? (
                    "שמור שינויים"
                  ) : (
                    "צור סוג פגישה"
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
