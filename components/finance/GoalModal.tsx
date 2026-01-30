"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  ArrowRight,
  Check,
  DollarSign,
  Users,
  Briefcase,
  FileText,
  Database,
  TrendingDown,
  TrendingUp,
  Target,
  Minus,
  Wallet,
  Table,
  Calendar,
  CheckSquare,
  Search,
  RefreshCw,
} from "lucide-react";
import {
  MetricType,
  GoalFormData,
  GoalFilters,
  previewGoalValue,
} from "@/app/actions/goals";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Preview has been calculated flag
type PreviewState = "idle" | "loading" | "done";

interface GoalModalProps {
  metrics: {
    type: string;
    name: string;
    description: string;
    available: boolean;
    icon: string;
  }[];
  tables: { id: number; name: string; columns?: any[] }[];
  clients?: { id: number; name: string; company?: string | null }[];
  existingGoal?: any;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

const formatDateForInput = (date: Date | string | undefined) => {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch (e) {
    return "";
  }
};

export default function GoalModal({
  metrics,
  tables,
  clients = [],
  existingGoal,
  trigger,
  onSuccess,
}: GoalModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Initial State
  const [formData, setFormData] = useState<Partial<GoalFormData>>({
    name: "",
    metricType: "REVENUE",
    targetType: "SUM",
    targetValue: undefined,
    periodType: "MONTHLY",
    startDate: new Date(),
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    filters: {
      source: "TRANSACTIONS_ONE_TIME",
    },
    notes: "",
  });

  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [refreshCount, setRefreshCount] = useState(0);
  const [lastRefreshedDates, setLastRefreshedDates] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const MAX_REFRESHES = 5;

  // Check if dates have changed since last refresh
  const datesChanged =
    lastRefreshedDates === null ||
    lastRefreshedDates.start !== formData.startDate?.toISOString() ||
    lastRefreshedDates.end !== formData.endDate?.toISOString();

  // Button should be disabled if: already refreshed same dates OR max refreshes reached
  const isRefreshDisabled =
    (previewState === "done" && !datesChanged) ||
    refreshCount >= MAX_REFRESHES ||
    previewState === "loading";

  // Manual fetch preview function - triggered by button click
  const handleFetchPreview = async () => {
    if (!formData.metricType) return;
    if (!formData.startDate || !formData.endDate) return;

    // Don't fetch if table is selected but no column is needed for SUM
    const needsColumnKey =
      formData.filters?.source === "TABLE" &&
      (formData.targetType === "SUM" || formData.metricType === "REVENUE");

    if (needsColumnKey && !formData.filters?.columnKey) {
      setPreviewValue(null);
      return;
    }

    // For RECORDS, we need a tableId
    if (formData.metricType === "RECORDS" && !formData.filters?.tableId) {
      setPreviewValue(null);
      return;
    }

    setPreviewState("loading");
    try {
      const val = await previewGoalValue(
        formData.metricType as MetricType,
        (formData.targetType as any) || "COUNT",
        (formData.periodType as any) || "MONTHLY",
        formData.startDate!,
        formData.endDate!,
        (formData.filters || {}) as GoalFilters,
      );
      setPreviewValue(val);
      setPreviewState("done");
      setRefreshCount((prev) => prev + 1);
      setLastRefreshedDates({
        start: formData.startDate!.toISOString(),
        end: formData.endDate!.toISOString(),
      });
    } catch (e) {
      console.error("Preview failed", e);
      setPreviewState("idle");
    }
  };

  // Handle Form Reset/Init
  useEffect(() => {
    if (existingGoal && open) {
      setFormData({
        ...existingGoal,
        startDate: new Date(existingGoal.startDate),
        endDate: new Date(existingGoal.endDate),
        targetValue: Number(existingGoal.targetValue),
        filters: existingGoal.filters || {},
      });
      setStep(2);
    } else if (open && !existingGoal) {
      setStep(1);
      setFormData({
        name: "",
        metricType: "REVENUE",
        targetType: "SUM",
        targetValue: undefined,
        periodType: "MONTHLY",
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        filters: { source: "TRANSACTIONS_ONE_TIME" },
        notes: "",
      });
      setPreviewValue(null);
      setPreviewState("idle");
      setRefreshCount(0);
      setLastRefreshedDates(null);
    }
  }, [existingGoal, open]);

  const handleSubmit = async () => {
    // Allow 0 as a valid targetValue (for REDUCE mode)
    if (
      !formData.name ||
      formData.targetValue === undefined ||
      formData.targetValue === null
    ) {
      toast({
        title: "שגיאה",
        description: "נא למלא את כל שדות החובה",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const url = existingGoal
        ? `/api/finance/goals/${existingGoal.id}`
        : "/api/finance/goals";
      const method = existingGoal ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed");

      toast({
        title: "הצלחה!",
        description: existingGoal ? "היעד עודכן בהצלחה" : "היעד נוצר בהצלחה",
      });

      setOpen(false);
      router.refresh();
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: "שגיאה",
        description: "משהו השתבש, נסה שנית",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = (key: keyof GoalFilters, value: any) => {
    setFormData((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value === "all" ? undefined : value },
    }));
  };

  // Helper to get a helpful message when preview is 0
  const getZeroResultMessage = () => {
    if (formData.metricType === "RECORDS") {
      if (!formData.filters?.tableId) {
        return "בחר טבלה כדי לראות כמה רשומות קיימות";
      }
      return "אין רשומות בטווח התאריכים הנבחר";
    }
    if (formData.metricType === "CALENDAR") {
      return "אין אירועים בטווח התאריכים הנבחר";
    }
    if (formData.metricType === "QUOTES") {
      return "אין הצעות מחיר שתואמות את הסינון והתאריכים שנבחרו";
    }
    if (formData.metricType === "TASKS") {
      return "אין משימות שתואמות את הסטטוס הנבחר";
    }
    if (
      formData.metricType === "REVENUE" &&
      formData.filters?.source === "TABLE" &&
      !formData.filters?.columnKey
    ) {
      return "בחר עמודה לסיכום";
    }
    return "אין נתונים בטווח התאריכים הנבחר";
  };

  const PreviewBanner = () => (
    <div className="mt-4 p-3 bg-[#4f95ff]/10 border border-[#4f95ff]/20 rounded-lg animate-in fade-in transition-all">
      {/* Always show disclaimer */}
      <p className="text-xs text-gray-500 mb-3 text-center border-b border-gray-200 pb-2">
        עד {MAX_REFRESHES - refreshCount} רענונים נותרו • לחץ על הכפתור לחישוב
        הנתונים בטווח התאריכים
      </p>

      {previewState === "idle" ? (
        // Initial state - show button to calculate
        <div className="flex flex-col items-center gap-2 py-1">
          <button
            type="button"
            onClick={handleFetchPreview}
            disabled={isRefreshDisabled}
            className="flex items-center gap-2 px-4 py-2 bg-[#4f95ff] text-white rounded-lg text-sm font-medium hover:bg-[#3d7ccc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            חשב מצב נוכחי
          </button>
        </div>
      ) : previewState === "loading" ? (
        // Loading state
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="w-5 h-5 text-[#4f95ff] animate-spin" />
          <span className="text-sm text-gray-600">מחשב...</span>
        </div>
      ) : (
        // Done state - show result with refresh option
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#4f95ff]/20 rounded-md">
                <Check className="w-4 h-4 text-[#4f95ff]" />
              </div>
              <div>
                <span className="text-xs text-[#4f95ff] font-medium uppercase tracking-wider block">
                  מצב נוכחי
                </span>
                <span className="text-sm text-gray-900 font-bold">
                  {previewValue !== null ? previewValue.toLocaleString() : "-"}{" "}
                  {formData.targetType === "SUM"
                    ? "₪"
                    : formData.metricType === "RECORDS"
                      ? "רשומות"
                      : "יח׳"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFetchPreview}
              disabled={isRefreshDisabled}
              className="p-2 text-[#4f95ff] hover:bg-[#4f95ff]/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                isRefreshDisabled
                  ? refreshCount >= MAX_REFRESHES
                    ? "הגעת למקסימום רענונים"
                    : "שנה תאריכים כדי לרענן"
                  : "חשב מחדש"
              }
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {!datesChanged && previewState === "done" && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              ℹ️ שנה תאריכים כדי לחשב מחדש
            </p>
          )}
          {previewValue === 0 && (
            <p className="text-xs text-[#a24ec1] mt-2 pr-9">
              💡 {getZeroResultMessage()}
            </p>
          )}
        </>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300 pt-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          {
            type: "REVENUE",
            label: "הכנסות",
            icon: DollarSign,
            desc: "יעד כספי להכנסות",
          },
          {
            type: "RETAINERS",
            label: "ריטיינרים",
            icon: Briefcase,
            desc: "כמות/שווי חוזים",
          },
          {
            type: "CUSTOMERS",
            label: "לקוחות",
            icon: Users,
            desc: "ספירת לקוחות חדשים",
          },
          {
            type: "QUOTES",
            label: "הצעות מחיר",
            icon: FileText,
            desc: "הצעות וסגירות",
          },
          {
            type: "TASKS",
            label: "משימות",
            icon: CheckSquare,
            desc: "השלמת משימות",
          },
          {
            type: "RECORDS",
            label: "רשומות",
            icon: Table,
            desc: "יעדי הזנת נתונים",
          },
          {
            type: "CALENDAR",
            label: "פגישות ויומן",
            icon: Calendar,
            desc: "אירועים ביומן",
          },
        ].map((m) => (
          <button
            key={m.type}
            onClick={() => {
              // Set appropriate defaults based on metric type
              const isRecords = m.type === "RECORDS";
              const isRevenue = m.type === "REVENUE";

              setFormData((prev) => ({
                ...prev,
                metricType: m.type as MetricType,
                // Default target types
                targetType: isRevenue ? "SUM" : "COUNT",
                filters: {
                  source: isRecords ? "TABLE" : "TRANSACTIONS_ONE_TIME",
                  tableId: undefined,
                  columnKey: undefined,
                },
              }));
              setStep(2);
            }}
            className={cn(
              "flex flex-col items-center p-4 rounded-xl border-2 transition-all hover:border-[#4f95ff] hover:bg-[#4f95ff]/5",
              formData.metricType === m.type
                ? "border-[#4f95ff] bg-[#4f95ff]/5 ring-1 ring-[#4f95ff]"
                : "border-gray-200 bg-white",
            )}
            type="button"
          >
            <div
              className={cn(
                "p-2 rounded-full mb-2",
                formData.metricType === m.type
                  ? "bg-[#4f95ff]/20 text-[#4f95ff]"
                  : "bg-gray-100 text-gray-600",
              )}
            >
              <m.icon className="w-6 h-6" />
            </div>
            <span className="font-bold text-gray-900 text-sm">{m.label}</span>
            <span className="text-xs text-gray-600 mt-1 text-center">
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-gray-100 mt-2">
        <p className="text-xs text-gray-600 text-center flex items-center justify-center gap-1">
          <TrendingDown className="w-3 h-3" />
          יעדי הוצאות וצמצום עלויות - בקרוב
        </p>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const selectedTable = tables.find(
      (t) => t.id === Number(formData.filters?.tableId),
    );

    const showSumOption =
      ["REVENUE", "RETAINERS", "QUOTES", "SALES"].includes(
        formData.metricType || "",
      ) ||
      (formData.metricType === "RECORDS" &&
        selectedTable?.columns?.some((c: any) => c.type === "number"));

    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pt-2">
        <div className="space-y-4">
          {/* --- TARGET TYPE TOGGLE --- */}
          {showSumOption && (
            <div className="bg-[#f4f8f8] p-1 rounded-lg flex border border-gray-200">
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, targetType: "COUNT" }))
                }
                className={cn(
                  "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                  formData.targetType === "COUNT"
                    ? "bg-white text-[#4f95ff] shadow-sm ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900",
                )}
              >
                כמות (יחידות)
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, targetType: "SUM" }))
                }
                className={cn(
                  "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                  formData.targetType === "SUM"
                    ? "bg-white text-[#4f95ff] shadow-sm ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900",
                )}
              >
                ערך כספי (סכום)
              </button>
            </div>
          )}

          {/* REVENUE INFO + SOURCE SELECTOR */}
          {formData.metricType === "REVENUE" && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100">
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100 mb-2">
                <DollarSign className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד הכנסות
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    הגדר יעד כספי להכנסות ובחר את מקור הנתונים לחישוב. לדוגמה:
                    יעד של ₪50,000 הכנסות בחודש.
                  </p>
                </div>
              </div>
              <Label className="text-[#a24ec1] font-semibold">
                מקור הכנסה לחישוב
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateFilter("source", "TRANSACTIONS_ONE_TIME")
                  }
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-sm font-medium transition-all h-20",
                    formData.filters?.source === "TRANSACTIONS_ONE_TIME" ||
                      formData.filters?.source === "TRANSACTIONS" ||
                      !formData.filters?.source
                      ? "bg-white border-[#4f95ff] text-[#4f95ff] shadow-sm ring-1 ring-[#4f95ff]"
                      : "border-gray-200 text-gray-600 hover:bg-white",
                  )}
                >
                  <DollarSign className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">
                    גביית תשלומים חד פעמיים
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateFilter("source", "TRANSACTIONS_RETAINER")
                  }
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-sm font-medium transition-all h-20",
                    formData.filters?.source === "TRANSACTIONS_RETAINER"
                      ? "bg-white border-[#4f95ff] text-[#4f95ff] shadow-sm ring-1 ring-[#4f95ff]"
                      : "border-gray-200 text-gray-600 hover:bg-white",
                  )}
                >
                  <Briefcase className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">גביית ריטיינרים</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateFilter("source", "FINANCE_RECORD");
                    updateFilter("tableId", undefined);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-sm font-medium transition-all h-20",
                    formData.filters?.source === "FINANCE_RECORD"
                      ? "bg-white border-[#4f95ff] text-[#4f95ff] shadow-sm ring-1 ring-[#4f95ff]"
                      : "border-gray-200 text-gray-600 hover:bg-white",
                  )}
                >
                  <Wallet className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">
                    מודול הכנסות/הוצאות
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateFilter("source", "TABLE");
                    if (tables.length > 0)
                      updateFilter("tableId", tables[0].id);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-sm font-medium transition-all h-20",
                    formData.filters?.source === "TABLE"
                      ? "bg-white border-[#4f95ff] text-[#4f95ff] shadow-sm ring-1 ring-[#4f95ff]"
                      : "border-gray-200 text-gray-600 hover:bg-white",
                  )}
                >
                  <Database className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">טבלה מותאמת</span>
                </button>
              </div>

              {/* --- TRANSACTIONS (ONE TIME) SETTINGS --- */}
              {(formData.filters?.source === "TRANSACTIONS_ONE_TIME" ||
                formData.filters?.source === "TRANSACTIONS" ||
                !formData.filters?.source) && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3 bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-1.5 bg-[#4f95ff]/10 rounded-full shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#4f95ff]" />
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      המערכת תסכום תשלומים שהם תחת סטטוס
                      <strong className="font-bold text-gray-900 mx-1">
                        "שולם"
                      </strong>
                      בתאריכים שהוגדרו (תאריך פירעון/תשלום).
                    </p>
                  </div>
                </div>
              )}

              {/* --- TRANSACTIONS (RETAINER) SETTINGS --- */}
              {formData.filters?.source === "TRANSACTIONS_RETAINER" && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3 bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-1.5 bg-[#4f95ff]/10 rounded-full shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#4f95ff]" />
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      המערכת תסכום תשלומים שנגבו מתוך
                      <strong className="font-bold text-gray-900 mx-1">
                        ריטיינרים בלבד
                      </strong>
                      בתאריכים שהוגדרו (תאריך פירעון/תשלום).
                    </p>
                  </div>
                </div>
              )}

              {/* --- FINANCE MODULE SETTINGS --- */}
              {formData.filters?.source === "FINANCE_RECORD" && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3 bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-1.5 bg-[#4f95ff]/10 rounded-full shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#4f95ff]" />
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      המערכת תסכום אוטומטית את כל ה
                      <strong className="font-bold text-gray-900 mx-1">
                        הכנסות
                      </strong>
                      ממודול הכנסות והוצאות.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-900 font-medium">
                      סינון לפי קטגוריה (אופציונלי)
                    </Label>
                    <Input
                      placeholder="הקלד שם קטגוריה..."
                      className="bg-white border-gray-200 focus:border-[#4f95ff] transition-all"
                      value={formData.filters?.columnKey || ""}
                      onChange={(e) =>
                        updateFilter("columnKey", e.target.value)
                      }
                    />
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span className="text-[#a24ec1] font-medium">למשל:</span>
                      שיווק, מכירות (השאר ריק לסיכום הכל)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RECORDS / REVENUE-FROM-TABLE SETTINGS */}
          {(formData.metricType === "RECORDS" ||
            (formData.metricType === "REVENUE" &&
              formData.filters?.source === "TABLE")) && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              {formData.metricType === "RECORDS" && (
                <div className="animate-in fade-in slide-in-from-top-2 mb-4 space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
                    <Table className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-800 font-medium">
                        {formData.targetType === "SUM"
                          ? "יעד ערך כספי/מספרי (רשומות)"
                          : "יעד כמות רשומות"}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        {formData.targetType === "SUM"
                          ? "המערכת תסכום את הערכים בעמודה שתיבחר (כסף או מספר) עבור כל הרשומות החדשות שיווצרו בטווח התאריכים. מתאים ליעדים כמו 'סך שווי עסקאות חדשות' או 'צבירת נקודות'."
                          : "בחר טבלה והמערכת תספור כמה רשומות חדשות נוצרו בטווח התאריכים שתגדיר. לדוגמה: יעד של 100 לידים חדשים בחודש."}
                      </p>
                    </div>
                  </div>

                  {formData.targetType === "SUM" && (
                    <div className="flex items-start gap-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                      <div className="p-1 bg-[#4f95ff]/10 rounded-full shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#4f95ff]" />
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-semibold text-[#4f95ff] block mb-1">
                          חשוב לדעת:
                        </span>
                        החישוב מתבצע אך ורק עבור רשומות
                        <strong className="font-medium text-gray-900 mx-1">
                          שנוצרו 
                        </strong>
                        בתוך טווח התאריכים של היעד. רשומות ישנות שנערכו/עודכנו
                        בטווח זה <u>לא ייספרו</u>.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label>בחר טבלה</Label>
                <Select
                  value={formData.filters?.tableId?.toString()}
                  onValueChange={(val) => {
                    updateFilter("tableId", Number(val));
                    updateFilter("columnKey", undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר טבלה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Show column selector only if needed (for Sum targetType) */}
              {(formData.targetType === "SUM" ||
                formData.metricType === "REVENUE") && (
                <div className="space-y-1">
                  <Label>עמודת סכום לסיכום</Label>
                  <Select
                    value={formData.filters?.columnKey || ""}
                    onValueChange={(val) => updateFilter("columnKey", val)}
                    disabled={
                      !selectedTable?.columns ||
                      selectedTable.columns.filter((c: any) =>
                        ["number", "currency", "percentage"].includes(
                          c.type?.toLowerCase(),
                        ),
                      ).length === 0
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר עמודה..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTable?.columns
                        ?.filter((c: any) =>
                          ["number", "currency", "percentage"].includes(
                            c.type?.toLowerCase(),
                          ),
                        )
                        .map((c: any) => (
                          <SelectItem
                            key={c.key || c.id}
                            value={(c.key || c.id).toString()}
                          >
                            <span className="flex items-center gap-2">
                              {c.name}
                              <span className="text-xs text-gray-400">
                                ({c.type})
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {selectedTable &&
                    (!selectedTable.columns ||
                      selectedTable.columns.filter((c: any) =>
                        ["number", "currency", "percentage"].includes(
                          c.type?.toLowerCase(),
                        ),
                      ).length === 0) && (
                      <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                        <Minus className="w-3 h-3" />
                        בטבלה זו אין עמודות מסוג מספר/כסף שניתן לסכום
                      </p>
                    )}
                </div>
              )}
            </div>
          )}

          {/* CALENDAR SETTINGS */}
          {formData.metricType === "CALENDAR" && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100 mb-2">
                <Calendar className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד פגישות ויומן
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    המערכת תספור כמה אירועים ביומן התקיימו בטווח התאריכים.
                    לדוגמה: יעד של 30 פגישות מכירה בחודש.
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>סינון שם/תיאור אירוע (אופציונלי)</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="למשל: 'פגישת מכירה', 'זום'..."
                    className="pr-9"
                    value={formData.filters?.searchQuery || ""}
                    onChange={(e) =>
                      updateFilter("searchQuery", e.target.value)
                    }
                  />
                </div>
                {/* Recommended filter disclaimer */}
                <div className="flex items-start gap-2 p-2.5 bg-[#a24ec1]/10 border border-[#a24ec1]/20 rounded-lg mt-2">
                  <span className="text-[#a24ec1] text-sm">💡</span>
                  <p className="text-xs text-[#a24ec1] font-medium">
                    הסינון הזה <strong>אופציונלי אך מומלץ מאוד!</strong> הגדרת
                    שם/תיאור מאפשרת מעקב מדויק אחרי סוג פגישות ספציפי (למשל: רק
                    פגישות מכירה).
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  השאר ריק כדי לספור את כל האירועים ביומן בטווח הזמן הנבחר.
                </p>
              </div>
            </div>
          )}

          {/* TASKS SETTINGS */}
          {formData.metricType === "TASKS" && (
            <div className="space-y-4 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              {/* Header */}
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
                <CheckSquare className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד משימות
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    בחר את סוג היעד שמתאים לך - ספירת משימות בסטטוס מסוים או יעד
                    לצמצום משימות.
                  </p>
                </div>
              </div>

              {/* Task Goal Mode Toggle */}
              <div className="space-y-2">
                <Label className="text-[#a24ec1] font-semibold">
                  סוג יעד משימות
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Count by Status */}
                  <button
                    type="button"
                    onClick={() => updateFilter("taskGoalMode", "COUNT")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                      formData.filters?.taskGoalMode === "COUNT" ||
                        !formData.filters?.taskGoalMode
                        ? "border-[#4f95ff] bg-white shadow-md ring-1 ring-[#4f95ff]"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    <div
                      className={cn(
                        "p-2.5 rounded-full",
                        formData.filters?.taskGoalMode === "COUNT" ||
                          !formData.filters?.taskGoalMode
                          ? "bg-[#4f95ff]/20 text-[#4f95ff]"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">
                        ספירת משימות
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        סופר כמה משימות הגיעו לסטטוס מסוים
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Reduce Tasks */}
                  <button
                    type="button"
                    onClick={() => updateFilter("taskGoalMode", "REDUCE")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                      formData.filters?.taskGoalMode === "REDUCE"
                        ? "border-[#a24ec1] bg-white shadow-md ring-1 ring-[#a24ec1]"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    <div
                      className={cn(
                        "p-2.5 rounded-full",
                        formData.filters?.taskGoalMode === "REDUCE"
                          ? "bg-[#a24ec1]/20 text-[#a24ec1]"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">
                        צמצום משימות
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        יעד להגיע לכמות נמוכה יותר
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Disclaimer based on selected mode */}
              {(formData.filters?.taskGoalMode === "COUNT" ||
                !formData.filters?.taskGoalMode) && (
                <div className="p-3 bg-[#4f95ff]/10 rounded-lg border border-[#4f95ff]/20 animate-in fade-in">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-[#4f95ff] mt-0.5 shrink-0" />
                    <div className="text-xs text-gray-700">
                      <p className="font-medium text-[#4f95ff]">איך זה עובד?</p>
                      <p className="mt-1">
                        המערכת סופרת כמה משימות הגיעו לסטטוס שבחרת בטווח
                        התאריכים.
                      </p>
                      <p className="mt-1.5 text-gray-600 bg-white/60 p-2 rounded border border-[#4f95ff]/10">
                        💡 <strong>לדוגמה:</strong> יעד של 100 משימות שהושלמו
                        בחודש - המערכת תספור כל משימה שעברה לסטטוס "הושלמו".
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {formData.filters?.taskGoalMode === "REDUCE" && (
                <div className="p-3 bg-[#a24ec1]/10 rounded-lg border border-[#a24ec1]/20 animate-in fade-in">
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-[#a24ec1] mt-0.5 shrink-0" />
                    <div className="text-xs text-gray-700">
                      <p className="font-medium text-[#a24ec1]">
                        איך זה עובד? (ספירה הפוכה)
                      </p>
                      <p className="mt-1">
                        המערכת בודקת כמה משימות <strong>נותרו</strong> בסטטוס
                        שבחרת. היעד הוא להגיע לכמות <strong>נמוכה יותר</strong>.
                      </p>
                      <p className="mt-1.5 text-gray-600 bg-white/60 p-2 rounded border border-[#a24ec1]/10">
                        💡 <strong>לדוגמה:</strong> יש לך 10 משימות בהשהייה ואתה
                        רוצה לצמצם ל-2. הגדר יעד של 2 משימות - וככל שתסיים יותר,
                        כך תתקרב ליעד!
                      </p>
                      <p className="mt-1.5 text-[#a24ec1] flex items-center gap-1">
                        <Minus className="w-3 h-3" />
                        מתאים ליעדי ניקוי, הורדת עומס, וצמצום backlogs
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status selector */}
              <div className="space-y-1">
                <Label>
                  {formData.filters?.taskGoalMode === "REDUCE"
                    ? "סטטוס לצמצום (כמה נותרו)"
                    : "סטטוס משימה לספירה"}
                </Label>
                <Select
                  value={
                    formData.filters?.status ||
                    (formData.filters?.taskGoalMode === "REDUCE"
                      ? "TODO"
                      : "COMPLETED")
                  }
                  onValueChange={(val) => updateFilter("status", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סטטוס..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">משימות לביצוע</SelectItem>
                    <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                    <SelectItem value="WAITING_CLIENT">
                      ממתין לאישור לקוח
                    </SelectItem>
                    <SelectItem value="ON_HOLD">בהשהייה</SelectItem>
                    <SelectItem value="COMPLETED">הושלמו</SelectItem>
                  </SelectContent>
                </Select>
                {formData.filters?.taskGoalMode === "REDUCE" && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    ⚠️ במצב צמצום, היעד הוא הכמות הסופית שתרצה להגיע אליה (לא
                    כמה לסיים)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* RETAINER FILTERS */}
          {formData.metricType === "RETAINERS" && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100 mb-2">
                <Briefcase className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד ריטיינרים
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    המערכת תספור כמה ריטיינרים פעילים או סכום החוזים. לדוגמה:
                    יעד של 10 ריטיינרים חודשיים או ₪30,000 בחוזים.
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>סינון לפי תדירות הריטיינרים</Label>
                <Select
                  value={formData.filters?.frequency || "all"}
                  onValueChange={(val) => updateFilter("frequency", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="quarterly">רבעוני</SelectItem>
                    <SelectItem value="yearly">שנתי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* CUSTOMERS INFO */}
          {formData.metricType === "CUSTOMERS" && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
                <Users className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד לקוחות
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    המערכת תספור כמה לקוחות חדשים נוספו בטווח התאריכים שתגדיר.
                    לדוגמה: יעד של 50 לקוחות חדשים בחודש.
                  </p>
                  <p className="text-xs text-[#a24ec1] mt-2 flex items-center gap-1">
                    ℹ️ הנתונים נלקחים מרשימת הלקוחות בעמוד כספים
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* QUOTES INFO */}
          {formData.metricType === "QUOTES" && (
            <div className="space-y-3 p-4 bg-[#f4f8f8] rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-100">
                <FileText className="w-5 h-5 text-[#a24ec1] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">
                    יעד הצעות מחיר
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    המערכת תספור כמות או סכום הצעות המחיר בטווח התאריכים.
                    לדוגמה: יעד של 20 הצעות מחיר או ₪100,000 בהצעות בחודש.
                  </p>
                </div>
              </div>

              {/* Quote Status Selector */}
              <div className="space-y-1">
                <Label>סינון לפי סטטוס הצעה</Label>
                <Select
                  value={formData.filters?.status || "all"}
                  onValueChange={(val) => updateFilter("status", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל (כל הסטטוסים)</SelectItem>
                    <SelectItem value="DRAFT">טיוטה (Draft)</SelectItem>
                    <SelectItem value="SENT">נשלחה (Sent)</SelectItem>
                    <SelectItem value="ACCEPTED">אושרה (Accepted)</SelectItem>
                    <SelectItem value="REJECTED">נדחתה (Rejected)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 mt-1">
                  בחר "הכל" כדי לכלול את כל ההצעות, או בחר סטטוס ספציפי לסינון
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Label>שם היעד</Label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="תן שם ליעד..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(1)}
              type="button"
            >
              חזרה
            </Button>
            <Button
              className="flex-[2] bg-[#4f95ff] hover:bg-blue-600"
              onClick={() => setStep(3)}
              type="button"
            >
              המשך <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pt-2">
      <div className="space-y-2">
        <Label className="text-lg font-bold text-[#a24ec1]">
          {formData.metricType === "TASKS" &&
          formData.filters?.taskGoalMode === "REDUCE"
            ? "כמות משימות מטרה (להגיע אליה)"
            : formData.targetType === "SUM"
              ? "סכום היעד"
              : "כמות היעד"}
        </Label>
        <div className="relative">
          <Input
            type="number"
            className="text-2xl font-bold h-14 pl-10"
            min={
              formData.metricType === "TASKS" &&
              formData.filters?.taskGoalMode === "REDUCE"
                ? 0
                : 1
            }
            value={
              formData.targetValue !== undefined ? formData.targetValue : ""
            }
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                targetValue:
                  e.target.value === "" ? undefined : Number(e.target.value),
              }))
            }
            autoFocus
          />
          {formData.targetType === "SUM" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
              ₪
            </div>
          )}
        </div>
        {formData.metricType === "TASKS" &&
          formData.filters?.taskGoalMode === "REDUCE" && (
            <p className="text-xs text-[#a24ec1] bg-[#a24ec1]/10 p-2 rounded-lg">
              💡 הזן 0 אם המטרה היא לסיים את כל המשימות בסטטוס הזה
            </p>
          )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>תאריך התחלה</Label>
          <Input
            type="date"
            value={formatDateForInput(formData.startDate)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime()))
                setFormData((prev) => ({ ...prev, startDate: d }));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>תאריך יעד</Label>
          <Input
            type="date"
            value={formatDateForInput(formData.endDate)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime()))
                setFormData((prev) => ({ ...prev, endDate: d }));
            }}
          />
        </div>
      </div>

      <PreviewBanner />

      <div className="pt-4 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setStep(2)}
          type="button"
        >
          חזרה
        </Button>
        <Button
          className="flex-2 bg-[#a24ec1] hover:bg-[#8e3dab] font-bold"
          onClick={handleSubmit}
          disabled={loading}
          type="button"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {existingGoal ? "עדכן יעד" : "צור יעד"}{" "}
              <Check className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  let title = existingGoal ? "עריכת יעד" : "הגדרת יעד חדש";
  if (step === 2) title = existingGoal ? "עריכת הגדרות" : "הגדרות מתקדמות";
  if (step === 3) title = "יעדים וזמנים";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-[#4f95ff] hover:bg-[#3d7ccc] text-white shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4 mr-2" />
            יעד חדש
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto sm:max-w-lg"
        dir="rtl"
      >
        <DialogHeader className="mb-2">
          <DialogTitle className="text-xl text-center md:text-right">
            {title}
          </DialogTitle>
          <DialogDescription className="text-center md:text-right">
            הגדרת יעדים חכמה
          </DialogDescription>
        </DialogHeader>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
    </Dialog>
  );
}
