"use client";

import { useState } from "react";
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
} from "lucide-react";
import { createSyncRule, runSyncRule } from "@/app/actions/finance-sync";
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

  const [sourceType, setSourceType] = useState<"TABLE" | "TRANSACTIONS">(
    "TABLE"
  );

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
    (t) => t.id.toString() === formData.sourceId
  );
  // FILTER: Only NUMBER columns can be amount fields
  const currentColumns = selectedTable?.columns || [];
  const numberColumns = currentColumns.filter(
    (c) => c.type === "number" || c.type === "currency"
  );

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
      const result = await runSyncRule(rule.id);

      toast({
        title: "תהליך הסתיים בהצלחה!",
        description: `נוצרו ${result.count} רשומות חדשות.`,
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
    } catch (error) {
      console.error(error);
      toast({
        title: "שגיאה",
        description: "נכשלה פעולת הסנכרון",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Progress Steps */}
      <div className="flex justify-between items-center px-8 relative">
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-200 -z-10" />
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-colors bg-white ${
              step >= s
                ? "border-indigo-600 text-indigo-600"
                : "border-gray-300 text-gray-400"
            }`}
          >
            {step > s ? <Check className="w-5 h-5" /> : s}
          </div>
        ))}
      </div>

      <Card className="p-6 shadow-lg border-indigo-100 min-h-[400px]">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                בחר מקור נתונים
              </h2>
              <p className="text-gray-500">מהיכן נאסוף את הנתונים הפיננסיים?</p>
            </div>

            <div className="w-full">
              <div className="grid w-full grid-cols-2 mb-6 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setSourceType("TABLE")}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    sourceType === "TABLE"
                      ? "bg-white shadow-sm text-indigo-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <TableIcon className="w-4 h-4" /> טבלה מותאמת
                </button>
                <button
                  onClick={() => setSourceType("TRANSACTIONS")}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    sourceType === "TRANSACTIONS"
                      ? "bg-white shadow-sm text-indigo-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> מערכת תשלומים (CRM)
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>שם לחוק האיסוף</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder={
                      sourceType === "TABLE"
                        ? "למשל: ייבוא לידים כהכנסה"
                        : "למשל: סנכרון תשלומים מהמערכת"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>סוג תנועה</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() =>
                        setFormData((p) => ({ ...p, targetType: "INCOME" }))
                      }
                      className={`p-3 rounded-lg border-2 font-bold transition-all text-sm ${
                        formData.targetType === "INCOME"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200"
                      }`}
                    >
                      הכנסות
                    </button>
                    <button
                      onClick={() =>
                        setFormData((p) => ({ ...p, targetType: "EXPENSE" }))
                      }
                      className={`p-3 rounded-lg border-2 font-bold transition-all text-sm ${
                        formData.targetType === "EXPENSE"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200"
                      }`}
                    >
                      הוצאות
                    </button>
                  </div>
                </div>

                {sourceType === "TABLE" && (
                  <div className="space-y-2">
                    <Label>בחר טבלת מקור</Label>
                    <Select
                      value={formData.sourceId}
                      onValueChange={(val) =>
                        setFormData((p) => ({ ...p, sourceId: val }))
                      }
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
                )}

                {sourceType === "TRANSACTIONS" && (
                  <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-200 mt-4">
                    <p className="font-bold mb-1">איסוף אוטומטי</p>
                    המערכת תסרוק את כל העסקאות בסטטוס "שולם" ותוסיף אותן לדוח
                    הפיננסי באופן אוטומטי.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => setStep(sourceType === "TABLE" ? 2 : 3)}
                disabled={
                  !formData.name ||
                  (sourceType === "TABLE" && !formData.sourceId)
                }
              >
                {sourceType === "TABLE" ? "המשך למיפוי" : "המשך לסיכום"}{" "}
                <ArrowLeft className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && sourceType === "TABLE" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">מיפוי שדות</h2>
              <p className="text-gray-500">
                בחר אילו עמודות מייצגות את הסכום והתאריך
              </p>
            </div>

            {currentColumns.length === 0 ? (
              <div className="text-center p-8 bg-red-50 text-red-600 rounded-lg">
                <p className="font-bold">לא נמצאו עמודות בטבלה זו.</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setStep(1)}
                >
                  חזרה
                </Button>
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label className="text-indigo-600 font-bold">
                    עמודת סכום (מספרים בלבד)
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
                    <SelectTrigger>
                      <SelectValue placeholder="בחר עמודת מחיר..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numberColumns.length > 0 ? (
                        numberColumns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name} ({c.type})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-gray-500 text-center">
                          אין עמודות מספריות בטבלה זו
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>עמודת תאריך</Label>
                    <Select
                      value={formData.mapping.dateField}
                      onValueChange={(val) =>
                        setFormData((p) => ({
                          ...p,
                          mapping: { ...p.mapping, dateField: val },
                        }))
                      }
                    >
                      <SelectTrigger>
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
                    <Label>כותרת/תיאור</Label>
                    <Select
                      value={formData.mapping.titleField}
                      onValueChange={(val) =>
                        setFormData((p) => ({
                          ...p,
                          mapping: { ...p.mapping, titleField: val },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר..." />
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

                <div className="space-y-2 pt-4 border-t mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="font-bold text-gray-700">
                      סיווג לקטגוריה (אופציונלי)
                    </Label>
                  </div>

                  <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-xs mb-3 space-y-1">
                    <p>
                      <strong>מה זה קטגוריה?</strong> זהו התיוג שיופיע בדוח
                      הפיננסי (למשל: "מכירות", "שיווק", "משכורות").
                    </p>
                    <ul className="list-disc list-inside pr-1">
                      <li>
                        <strong>ערך קבוע:</strong> כל הרשומות יקבלו את אותה
                        קטגוריה (למשל, כולן "מכירות").
                      </li>
                      <li>
                        <strong>מעמודה:</strong> הקטגוריה תיקח את השם שלה מתוך
                        עמודה בטבלה (למשל, עמודת "מקור הליד" תסווג כ-"פייסבוק"
                        או "גוגל").
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-2 items-start">
                    <div className="w-1/3">
                      <Select
                        value={formData.mapping.categoryField}
                        onValueChange={(val) =>
                          setFormData((p) => ({
                            ...p,
                            mapping: { ...p.mapping, categoryField: val },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="static">
                            ערך קבוע (מומלץ)
                          </SelectItem>
                          {currentColumns.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              לפי עמודה: {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1">
                      {formData.mapping.categoryField === "static" ? (
                        <Input
                          placeholder="הזן שם קטגוריה (למשל: מכירות)"
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
                        />
                      ) : (
                        <div className="p-2 bg-gray-100 rounded text-sm text-gray-500 border">
                          הקטגוריה תיקבע אוטומטית לפי הערך בעמודה שנבחרה.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                חזרה
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!formData.mapping.amountField}
              >
                הבא: סיכום והרצה <ArrowLeft className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <Database className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold">מוכן לסנכרון!</h2>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm w-full max-w-sm text-right space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">שם החוק:</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">מקור:</span>
                <span className="font-medium">
                  {sourceType === "TABLE"
                    ? selectedTable?.name
                    : "מערכת תשלומים"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">סוג יעד:</span>
                <span
                  className={`font-bold ${
                    formData.targetType === "INCOME"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formData.targetType === "INCOME" ? "הכנסות" : "הוצאות"}
                </span>
              </div>
            </div>

            <div className="flex gap-4 pt-6 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(sourceType === "TABLE" ? 2 : 1)}
              >
                חזרה
              </Button>
              <Button
                className="flex-2 bg-indigo-600 hover:bg-indigo-700 text-lg py-6"
                onClick={handleCreateAndRun}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                ) : (
                  <Play className="w-6 h-6 mr-2" />
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
