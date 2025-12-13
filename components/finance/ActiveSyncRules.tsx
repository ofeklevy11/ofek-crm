"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Trash2,
  RefreshCw,
  Play,
  Database,
  CreditCard,
  Edit2,
  Save,
  X,
} from "lucide-react";
import {
  deleteSyncRule,
  runSyncRule,
  updateSyncRule,
} from "@/app/actions/finance-sync";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ActiveSyncRules({ rules }: { rules: any[] }) {
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"INCOME" | "EXPENSE">("INCOME");

  const startEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditName(rule.name);
    setEditType(rule.targetType);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (id: number) => {
    try {
      await updateSyncRule(id, { name: editName, targetType: editType });
      toast({ title: "החוק עודכן בהצלחה" });
      setEditingId(null);
    } catch (e) {
      toast({ title: "שגיאה בעדכון", variant: "destructive" });
    }
  };

  const handleRun = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await runSyncRule(id);
      if (res.stats.created > 0) {
        toast({
          title: "סנכרון הושלם בהצלחה",
          description: `נוצרו ${res.stats.created} רשומות חדשות. (${res.stats.skippedExists} דולגו כי קיימים כבר)`,
        });
      } else if (res.stats.skippedError > 0) {
        toast({
          title: "זוהו שגיאות בסנכרון",
          description: `נכשלו: ${
            res.stats.skippedError
          } רשומות. שגיאה ראשונה: ${res.stats.errors[0] || "שגיאה לא ידועה"}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "לא נמצאו נתונים חדשים",
          description: `נסרקו ${res.stats.scanned} רשומות. ${res.stats.skippedExists} כבר קיימות במערכת.`,
        });
      }
    } catch (e) {
      toast({
        title: "שגיאה",
        description: "הסנכרון נכשל (ראה קונסול)",
        variant: "destructive",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "האם אתה בטוח? הרשומות שכבר נוצרו יישארו בדוח אך ינותקו מחוק זה."
      )
    )
      return;
    try {
      await deleteSyncRule(id);
      toast({ title: "חוק נמחק בהצלחה" });
    } catch (e) {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  if (rules.length === 0)
    return (
      <div className="text-center text-gray-500 py-4">
        אין חוקי איסוף פעילים.
      </div>
    );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-bold text-gray-900">חוקי איסוף פעילים</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
        {rules.map((rule) => {
          const isEditing = editingId === rule.id;

          return (
            <Card
              key={rule.id}
              className={`p-4 flex flex-col justify-between border-l-4 transition-all ${
                isEditing
                  ? "border-l-blue-500 bg-blue-50/30"
                  : "border-l-indigo-500 hover:shadow-md"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start gap-3 w-full">
                  <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
                    {rule.sourceType === "TABLE" ? (
                      <Database className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                  <div className="w-full">
                    {isEditing ? (
                      <div className="space-y-3 mb-2">
                        <div>
                          <Label>שם החוק</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-white h-8"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditType("INCOME")}
                            className={`text-xs px-2 py-1 rounded border ${
                              editType === "INCOME"
                                ? "bg-green-100 border-green-500 text-green-700 font-bold"
                                : "bg-white"
                            }`}
                          >
                            הכנסות
                          </button>
                          <button
                            onClick={() => setEditType("EXPENSE")}
                            className={`text-xs px-2 py-1 rounded border ${
                              editType === "EXPENSE"
                                ? "bg-red-100 border-red-500 text-red-700 font-bold"
                                : "bg-white"
                            }`}
                          >
                            הוצאות
                          </button>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 p-2 rounded text-xs text-blue-700 mt-2">
                          <p className="font-semibold mb-1">שים לב:</p>
                          לא ניתן לערוך את המקור או המיפוי בחוק קיים. כדי לשנות,
                          יש ליצור חוק חדש.
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold text-gray-900">{rule.name}</h3>
                        <p className="text-sm text-gray-500">
                          <span
                            className={`font-medium ${
                              rule.targetType === "INCOME"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {rule.targetType === "INCOME" ? "הכנסות" : "הוצאות"}
                          </span>{" "}
                          •
                          {rule.sourceType === "TABLE"
                            ? ` מטבלה #${rule.sourceId}`
                            : " ממערכת התשלומים"}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          רץ לאחרונה:{" "}
                          {rule.lastRunAt
                            ? format(
                                new Date(rule.lastRunAt),
                                "dd/MM/yyyy HH:mm"
                              )
                            : "מעולם לא"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t pt-3 mt-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-gray-500"
                      onClick={cancelEdit}
                    >
                      <X className="w-3 h-3 mr-1" /> ביטול
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={() => saveEdit(rule.id)}
                    >
                      <Save className="w-3 h-3 mr-1" /> שמור שינויים
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-gray-400 hover:text-gray-600"
                      onClick={() => startEdit(rule)}
                    >
                      <Edit2 className="w-3 h-3 mr-1" /> ערוך
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> מחק
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => handleRun(rule.id)}
                      disabled={loadingId === rule.id}
                    >
                      {loadingId === rule.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      {loadingId === rule.id ? "..." : "הרץ"}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
