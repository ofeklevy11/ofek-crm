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
  Wallet,
  Table,
  Calendar,
  CheckSquare,
  Search,
  ListFilter,
} from "lucide-react";
import {
  MetricType,
  GoalFormData,
  GoalFilters,
  previewGoalValue,
} from "@/app/actions/goals";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Optimized debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

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
      source: "TRANSACTIONS",
    },
    notes: "",
  });

  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Only debounce the specific fields required for calculation to improve performance
  const calculationPayload = useMemo(
    () => ({
      metricType: formData.metricType,
      targetType: formData.targetType,
      periodType: formData.periodType,
      startDate: formData.startDate,
      endDate: formData.endDate,
      filters: formData.filters,
    }),
    [
      formData.metricType,
      formData.targetType,
      formData.periodType,
      formData.startDate?.toISOString(), // Use string to prevent ref change
      formData.endDate?.toISOString(),
      JSON.stringify(formData.filters), // Deep compare filters
    ]
  );

  const debouncedPayload = useDebounce(calculationPayload, 800);

  // Effect to fetch preview - ONLY runs when debounced payload changes
  useEffect(() => {
    let active = true;

    async function fetchPreview() {
      if (!open || !debouncedPayload.metricType) return;
      if (!debouncedPayload.startDate || !debouncedPayload.endDate) return;

      // Don't fetch if table is selected but no column (optimization)
      if (
        debouncedPayload.filters?.source === "TABLE" &&
        !debouncedPayload.filters?.columnKey
      ) {
        setPreviewValue(null);
        return;
      }

      setIsPreviewLoading(true);
      try {
        const val = await previewGoalValue(
          debouncedPayload.metricType as MetricType,
          (debouncedPayload.targetType as any) || "COUNT",
          (debouncedPayload.periodType as any) || "MONTHLY",
          new Date(debouncedPayload.startDate!),
          new Date(debouncedPayload.endDate!),
          (debouncedPayload.filters || {}) as GoalFilters
        );
        if (active) setPreviewValue(val);
      } catch (e) {
        console.error("Preview failed", e);
      } finally {
        if (active) setIsPreviewLoading(false);
      }
    }

    fetchPreview();
    return () => {
      active = false;
    };
  }, [debouncedPayload, open]);

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
      setStep(1);
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
        filters: { source: "TRANSACTIONS" },
        notes: "",
      });
      setPreviewValue(null);
    }
  }, [existingGoal, open]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.targetValue) {
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

  const PreviewBanner = () => (
    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between animate-in fade-in transition-all">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-blue-100 rounded-md">
          {isPreviewLoading ? (
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          ) : (
            <Check className="w-4 h-4 text-blue-600" />
          )}
        </div>
        <div>
          <span className="text-xs text-blue-600 font-medium uppercase tracking-wider block">
            נכון להיום
          </span>
          <span className="text-sm text-blue-900 font-bold">
            {isPreviewLoading
              ? "מחשב..."
              : `${
                  previewValue !== null ? previewValue.toLocaleString() : "-"
                } ${formData.targetType === "SUM" ? "₪" : "יח׳"}`}
          </span>
        </div>
      </div>
      {!isPreviewLoading && previewValue === 0 && (
        <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200">
          תוצאה: 0
        </span>
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
            type: "LEADS",
            label: "לידים",
            icon: Users,
            desc: "לקוחות חדשים",
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
              setFormData((prev) => ({
                ...prev,
                metricType: m.type as MetricType,
                // Default target types
                targetType: ["REVENUE"].includes(m.type) ? "SUM" : "COUNT",
                filters: { source: "TRANSACTIONS" },
              }));
              setStep(2);
            }}
            className={cn(
              "flex flex-col items-center p-4 rounded-xl border-2 transition-all hover:border-indigo-500 hover:bg-indigo-50",
              formData.metricType === m.type
                ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                : "border-gray-200 bg-white"
            )}
            type="button"
          >
            <div
              className={cn(
                "p-2 rounded-full mb-2",
                formData.metricType === m.type
                  ? "bg-indigo-200 text-indigo-700"
                  : "bg-gray-100 text-gray-600"
              )}
            >
              <m.icon className="w-6 h-6" />
            </div>
            <span className="font-bold text-gray-900 text-sm">{m.label}</span>
            <span className="text-xs text-gray-500 mt-1 text-center">
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-gray-100 mt-2">
        <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
          <TrendingDown className="w-3 h-3" />
          יעדי הוצאות וצמצום עלויות - בקרוב
        </p>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const selectedTable = tables.find(
      (t) => t.id === Number(formData.filters?.tableId)
    );

    const showSumOption =
      ["REVENUE", "RETAINERS", "QUOTES", "SALES"].includes(
        formData.metricType || ""
      ) ||
      (formData.metricType === "RECORDS" &&
        selectedTable?.columns?.some((c: any) => c.type === "number"));

    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pt-2">
        <div className="space-y-4">
          {/* --- TARGET TYPE TOGGLE --- */}
          {showSumOption && (
            <div className="bg-gray-50 p-1 rounded-lg flex border border-gray-200">
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, targetType: "COUNT" }))
                }
                className={cn(
                  "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                  formData.targetType === "COUNT"
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700"
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
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                ערך כספי (סכום)
              </button>
            </div>
          )}

          {/* REVENUE SOURCE SELECTOR */}
          {formData.metricType === "REVENUE" && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <Label className="text-indigo-900 font-semibold">
                מקור הכנסה לחישוב
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter("source", "TRANSACTIONS")}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md border text-sm font-medium transition-all h-20",
                    formData.filters?.source === "TRANSACTIONS" ||
                      !formData.filters?.source
                      ? "bg-white border-indigo-500 text-indigo-700 shadow-sm ring-1 ring-indigo-500"
                      : "border-gray-200 text-gray-600 hover:bg-white"
                  )}
                >
                  <DollarSign className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">מערכת תשלומים</span>
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
                      ? "bg-white border-indigo-500 text-indigo-700 shadow-sm ring-1 ring-indigo-500"
                      : "border-gray-200 text-gray-600 hover:bg-white"
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
                      ? "bg-white border-indigo-500 text-indigo-700 shadow-sm ring-1 ring-indigo-500"
                      : "border-gray-200 text-gray-600 hover:bg-white"
                  )}
                >
                  <Database className="w-5 h-5 mb-1" />
                  <span className="text-xs text-center">טבלה מותאמת</span>
                </button>
              </div>

              {/* --- FINANCE MODULE SETTINGS --- */}
              {formData.filters?.source === "FINANCE_RECORD" && (
                <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2 bg-white p-3 rounded border border-gray-100">
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    המערכת תסכום אוטומטית את כל ה<strong>הכנסות</strong> ממודול
                    הכנסות והוצאות.
                  </p>
                  <div className="space-y-1">
                    <Label>סינון לפי קטגוריה (אופציונלי)</Label>
                    <Input
                      placeholder="למשל: שיווק, מכירות (השאר ריק לסיכום הכל)"
                      value={formData.filters?.columnKey || ""}
                      onChange={(e) =>
                        updateFilter("columnKey", e.target.value)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RECORDS / REVENUE-FROM-TABLE SETTINGS */}
          {(formData.metricType === "RECORDS" ||
            (formData.metricType === "REVENUE" &&
              formData.filters?.source === "TABLE")) && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
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
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר עמודה..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTable?.columns?.map((c: any) => (
                        <SelectItem key={c.key || c.id} value={c.key || c.id}>
                          <span className="flex items-center gap-2">
                            {c.name}
                            <span className="text-xs text-gray-400">
                              ({c.type})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                      {(!selectedTable?.columns ||
                        selectedTable.columns.length === 0) && (
                        <SelectItem value="none" disabled>
                          אין עמודות זמינות בטבלה זו
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* CALENDAR SETTINGS */}
          {formData.metricType === "CALENDAR" && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
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
                <p className="text-xs text-gray-500">
                  השאר ריק כדי לספור את כל האירועים ביומן בטווח הזמן הנבחר.
                </p>
              </div>
            </div>
          )}

          {/* TASKS SETTINGS */}
          {formData.metricType === "TASKS" && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <Label>סטטוס משימה</Label>
                <Select
                  value={formData.filters?.status || "DONE"}
                  onValueChange={(val) => updateFilter("status", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סטטוס..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DONE">הושלמו (Done)</SelectItem>
                    <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                    <SelectItem value="OPEN">פתוחות</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* RETAINER FILTERS */}
          {formData.metricType === "RETAINERS" && (
            <div className="space-y-3 border-t border-b py-4 border-dashed border-gray-200">
              <div className="space-y-1">
                <Label>סינון לפי תדירות</Label>
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
                    <SelectItem value="yearly">שנתי</SelectItem>
                  </SelectContent>
                </Select>
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

          <PreviewBanner />

          <Button
            className="w-full bg-indigo-600"
            onClick={() => setStep(3)}
            type="button"
          >
            המשך <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pt-2">
      <div className="space-y-2">
        <Label className="text-lg font-bold text-indigo-700">
          {formData.targetType === "SUM" ? "סכום היעד" : "כמות היעד"}
        </Label>
        <div className="relative">
          <Input
            type="number"
            className="text-2xl font-bold h-14 pl-10"
            value={formData.targetValue || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                targetValue: Number(e.target.value),
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
          className="flex-[2] bg-green-600 hover:bg-green-700 font-bold"
          onClick={handleSubmit}
          disabled={loading}
          type="button"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              צור יעד <Check className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  let title = "הגדרת יעד חדש";
  if (step === 2) title = "הגדרות מתקדמות";
  if (step === 3) title = "יעדים וזמנים";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200">
            <Plus className="w-4 h-4 mr-2" />
            יעד חדש
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
