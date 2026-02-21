"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  Check,
  Database,
  Play,
  Loader2,
  ArrowLeft,
  CreditCard,
  Table as TableIcon,
  ChevronLeft,
  Settings2,
  ArrowDownToLine,
} from "lucide-react";
import { createSyncRule, enqueueSyncJob } from "@/app/actions/finance-sync";
import { useToast } from "@/hooks/use-toast";

interface TableMeta {
  id: number;
  name: string;
  columns: { id: string; key: string; name: string; type: string }[];
}

export default function DataCollectionWizard({
  tables,
}: {
  tables: TableMeta[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sourceType = "TABLE"; // Only table source is now available through wizard

  const [formData, setFormData] = useState({
    name: "",
    targetType: "EXPENSE",
    sourceId: "", // Only for TABLE
    mapping: {
      amountField: "",
      dateField: "",
      titleField: "",
      categoryField: "static",
      categoryValue: "",
    },
  });

  const selectedTable = tables.find(
    (t) => t.id.toString() === formData.sourceId,
  );
  // FILTER: Only NUMBER columns can be amount fields
  const currentColumns = selectedTable?.columns || [];
  const numberColumns = currentColumns.filter(
    (c) => c.type === "number" || c.type === "currency",
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleCreateAndRun = async () => {
    if (!formData.name) {
      toast({
        title: "שגיאה",
        description: "חסר שם לחוק",
        variant: "destructive",
      });
      return;
    }
    if (
      sourceType === "TABLE" &&
      (!formData.sourceId || !formData.mapping.amountField)
    ) {
      toast({
        title: "שגיאה",
        description: "חסרים פרטי מיפוי",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    stopPolling();
    try {
      const ruleData: any = {
        name: formData.name,
        targetType: formData.targetType as "INCOME" | "EXPENSE",
        sourceType: sourceType,
        sourceId:
          sourceType === "TABLE" ? Number(formData.sourceId) : undefined,
        fieldMapping: {
          amountField: formData.mapping.amountField,
          dateField: formData.mapping.dateField,
          titleField: formData.mapping.titleField,
          categoryValue:
            formData.mapping.categoryField === "static"
              ? formData.mapping.categoryValue
              : undefined,
          categoryField:
            formData.mapping.categoryField !== "static"
              ? formData.mapping.categoryField
              : undefined,
        },
      };

      const rule = await createSyncRule(ruleData);
      const { jobId } = await enqueueSyncJob(rule.id);

      // Auto-stop polling after 2 minutes
      const timeoutId = setTimeout(() => {
        stopPolling();
        setLoading(false);
        toast({
          title: "זמן המתנה עבר",
          description: "הסנכרון עדיין רץ ברקע. רענן את הדף בעוד מספר דקות.",
        });
      }, 120_000);

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/finance-sync/status/${jobId}`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.status === "COMPLETED") {
            stopPolling();
            clearTimeout(timeoutId);
            setLoading(false);
            toast({
              title: "תהליך הסתיים בהצלחה!",
              description: `נוצרו ${data.created} רשומות חדשות.`,
            });
            router.refresh();
            setStep(1);
            setFormData((p) => ({
              ...p,
              name: "",
              sourceId: "",
              mapping: {
                amountField: "",
                dateField: "",
                titleField: "",
                categoryField: "static",
                categoryValue: "",
              },
            }));
          } else if (data.status === "FAILED") {
            stopPolling();
            clearTimeout(timeoutId);
            setLoading(false);
            toast({
              title: "שגיאה",
              description: data.error || "נכשלה פעולת הסנכרון",
              variant: "destructive",
            });
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);
    } catch (error) {
      console.error(error);
      setLoading(false);
      toast({
        title: "שגיאה",
        description: "נכשלה פעולת הסנכרון",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full space-y-8" dir="rtl">
      {/* Progress Steps */}
      <div className="relative">
        <div className="absolute left-0 right-0 top-1/2 h-1 bg-gray-100 -z-10 rounded-full" />
        <div
          className="absolute left-0 right-0 top-1/2 h-1 bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] -z-10 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        />

        <div className="flex justify-between items-center px-2">
          {[1, 2, 3].map((s) => {
            const isActive = step >= s;
            const isCurrent = step === s;

            return (
              <div key={s} className="flex flex-col items-center gap-2">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-4 transition-all duration-300 shadow-sm ${
                    isActive
                      ? "border-[#4f95ff] bg-white text-[#4f95ff] shadow-[#4f95ff]/20"
                      : "border-white bg-gray-50 text-gray-300"
                  } ${isCurrent ? "scale-110 ring-4 ring-[#4f95ff]/10" : ""}`}
                >
                  {step > s ? <Check className="w-6 h-6" /> : s}
                </div>
                <div
                  className={`text-xs font-medium transition-colors ${
                    isActive ? "text-[#4f95ff]" : "text-gray-300"
                  }`}
                >
                  {s === 1
                    ? "בחירת מקור"
                    : s === 2
                      ? "מיפוי נתונים"
                      : "סיכום והרצה"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="p-8 rounded-3xl border border-white/50 shadow-xl shadow-gray-200/40 bg-white/80 backdrop-blur-sm min-h-[500px] flex flex-col relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-50/50 rounded-full blur-3xl -z-10 translate-y-1/2 -translate-x-1/2" />

        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                בחר מקור נתונים
              </h2>
              <p className="text-gray-500 mt-2 text-lg">
                מהיכן ברצונך לייבא נתונים פיננסיים?
              </p>
            </div>

            <div className="space-y-6 max-w-lg mx-auto w-full pt-4">
              <div className="space-y-2">
                <Label className="text-base">שם לחוק האיסוף</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="למשל: ייבוא לידים כהכנסה"
                  className="text-right h-12 text-lg bg-gray-50/50 border-gray-200 focus:border-[#4f95ff] focus:ring-[#4f95ff]/20 transition-all"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-base">הנתונים יישמרו כ:</Label>
                <div className="grid grid-cols-2 gap-4 p-1 bg-gray-100 rounded-xl">
                  <button
                    onClick={() =>
                      setFormData((p) => ({ ...p, targetType: "INCOME" }))
                    }
                    className={`py-3 px-4 rounded-lg font-bold transition-all text-sm flex items-center justify-center gap-2 ${
                      formData.targetType === "INCOME"
                        ? "bg-white text-[#4f95ff] shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4 rotate-180" /> הכנסות
                  </button>
                  <button
                    onClick={() =>
                      setFormData((p) => ({ ...p, targetType: "EXPENSE" }))
                    }
                    className={`py-3 px-4 rounded-lg font-bold transition-all text-sm flex items-center justify-center gap-2 ${
                      formData.targetType === "EXPENSE"
                        ? "bg-white text-[#a24ec1] shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4" /> הוצאות
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-base">בחר טבלת מקור</Label>
                <Select
                  value={formData.sourceId}
                  onValueChange={(val) =>
                    setFormData((p) => ({ ...p, sourceId: val }))
                  }
                >
                  <SelectTrigger
                    className="text-right h-12 bg-gray-50/50 border-gray-200"
                  >
                    <SelectValue placeholder="בחר טבלה..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {tables.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex justify-end pt-8">
              <Button
                onClick={() => setStep(2)}
                disabled={!formData.name || !formData.sourceId}
                className="bg-[#4f95ff] hover:bg-blue-600 text-white rounded-full px-8 py-6 text-lg shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
              >
                המשך למיפוי <ChevronLeft className="w-5 h-5 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && sourceType === "TABLE" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                מיפוי נתונים
              </h2>
              <p className="text-gray-500 mt-2 text-lg">
                התאם את העמודות בטבלה לשדות הפיננסיים
              </p>
            </div>

            {currentColumns.length === 0 ? (
              <div className="text-center p-12 bg-red-50 text-red-600 rounded-3xl border border-red-100">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Database className="w-6 h-6 text-red-600" />
                </div>
                <p className="font-bold text-lg">לא נמצאו עמודות בטבלה זו.</p>
                <Button
                  variant="outline"
                  className="mt-6 border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700"
                  onClick={() => setStep(1)}
                >
                  חזרה לבחירת טבלה
                </Button>
              </div>
            ) : (
              <div className="space-y-6 max-w-2xl mx-auto w-full">
                <div className="space-y-2 p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                  <Label className="text-[#4f95ff] font-bold text-lg flex items-center gap-2">
                    <Database className="w-4 h-4" /> עמודת סכום (חובה)
                  </Label>
                  <Select
                    value={formData.mapping.amountField}
                    onValueChange={(val) =>
                      setFormData((p) => ({
                        ...p,
                        mapping: { ...p.mapping, amountField: val },
                      }))
                    }
                  >
                    <SelectTrigger
                      className="text-right h-12 bg-white border-blue-200"
                    >
                      <SelectValue placeholder="בחר עמודת מספרים..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numberColumns.length > 0 ? (
                        numberColumns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name} ({c.type})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-gray-500 text-center">
                          אין עמודות מספריות בטבלה זו
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-base text-gray-600">
                      תאריך העסקה
                    </Label>
                    <Select
                      value={formData.mapping.dateField}
                      onValueChange={(val) =>
                        setFormData((p) => ({
                          ...p,
                          mapping: { ...p.mapping, dateField: val },
                        }))
                      }
                    >
                      <SelectTrigger
                        className="text-right h-12 bg-gray-50 border-gray-200"
                      >
                        <SelectValue placeholder="תאריך יצירה (ברירת מחדל)" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentColumns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base text-gray-600">
                      תיאור/כותרת
                    </Label>
                    <Select
                      value={formData.mapping.titleField}
                      onValueChange={(val) =>
                        setFormData((p) => ({
                          ...p,
                          mapping: { ...p.mapping, titleField: val },
                        }))
                      }
                    >
                      <SelectTrigger
                        className="text-right h-12 bg-gray-50 border-gray-200"
                      >
                        <SelectValue placeholder="בחר עמודת תיאור..." />
                      </SelectTrigger>
                      <SelectContent>
                        {currentColumns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Label className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-[#a24ec1]" /> סיווג
                      קטגוריה
                    </Label>
                  </div>

                  <div className="grid gap-4">
                    <div className="flex gap-4 items-start">
                      <div className="w-1/3 space-y-2">
                        <Label className="text-xs text-gray-400">
                          שיטת סיווג
                        </Label>
                        <Select
                          value={formData.mapping.categoryField}
                          onValueChange={(val) =>
                            setFormData((p) => ({
                              ...p,
                              mapping: { ...p.mapping, categoryField: val },
                            }))
                          }
                        >
                          <SelectTrigger
                            className="text-right h-11 bg-white"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="static">ערך קבוע</SelectItem>
                            {currentColumns.map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                לפי עמודה: {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1 space-y-2">
                        <Label className="text-xs text-gray-400">
                          {formData.mapping.categoryField === "static"
                            ? "שם הקטגוריה"
                            : "מידע"}
                        </Label>
                        {formData.mapping.categoryField === "static" ? (
                          <Input
                            placeholder="למשל: מכירות, שיווק..."
                            value={formData.mapping.categoryValue}
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                mapping: {
                                  ...p.mapping,
                                  categoryValue: e.target.value,
                                },
                              }))
                            }
                            className="text-right h-11 bg-white"
                          />
                        ) : (
                          <div className="h-11 px-3 flex items-center bg-gray-50 rounded-md text-sm text-gray-500 border border-gray-200">
                            הקטגוריה תיקבע לפי הערך בעמודה שנבחרה
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1" />

            <div className="flex justify-between pt-8">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="text-gray-500 hover:text-gray-800"
              >
                חזרה
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!formData.mapping.amountField}
                className="bg-[#4f95ff] hover:bg-blue-600 text-white rounded-full px-8 py-6 text-lg shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
              >
                הבא: סיכום <ChevronLeft className="w-5 h-5 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center text-center py-8">
            <div className="w-24 h-24 bg-gradient-to-tr from-[#4f95ff] to-[#a24ec1] rounded-full flex items-center justify-center mb-6 shadow-xl shadow-purple-500/30 text-white animate-pulse">
              <Database className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-gray-900">
                הכל מוכן!
              </h2>
              <p className="text-gray-500 text-lg">
                אנא וודא את הפרטים לפני הפעלת החוק
              </p>
            </div>

            <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-200 w-full max-w-md text-right space-y-4 shadow-inner">
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-500 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> שם החוק
                </span>
                <span className="font-bold text-gray-900">{formData.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-500 flex items-center gap-2">
                  {sourceType === "TABLE" ? (
                    <TableIcon className="w-4 h-4" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}{" "}
                  מקור
                </span>
                <span className="font-medium text-gray-900">
                  {sourceType === "TABLE"
                    ? selectedTable?.name
                    : "מערכת תשלומים וריטיינרים"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500 flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4" /> סוג יעד
                </span>
                <span
                  className={`font-bold px-3 py-1 rounded-full text-sm ${
                    formData.targetType === "INCOME"
                      ? "bg-blue-100 text-[#4f95ff]"
                      : "bg-purple-100 text-[#a24ec1]"
                  }`}
                >
                  {formData.targetType === "INCOME" ? "הכנסות" : "הוצאות"}
                </span>
              </div>
            </div>

            <div className="flex gap-4 pt-8 w-full max-w-md">
              <Button
                variant="outline"
                className="flex-1 py-6 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                onClick={() => setStep(sourceType === "TABLE" ? 2 : 1)}
              >
                חזרה לתיקון
              </Button>
              <Button
                className="flex-[2] bg-gradient-to-r from-[#4f95ff] to-[#a24ec1] hover:opacity-90 text-white text-lg py-6 rounded-xl shadow-lg shadow-purple-500/25 transition-all hover:scale-[1.02]"
                onClick={handleCreateAndRun}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                ) : (
                  <Play className="w-6 h-6 mr-2 fill-current" />
                )}
                {loading ? "מבצע איסוף נתונים..." : "צור והפעל חוק"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
