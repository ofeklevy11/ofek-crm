"use client";

import { useState, useEffect } from "react";
import { getUserFriendlyError } from "@/lib/errors";
import {
  X,
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  BarChart2,
  Check,
} from "lucide-react";
import { getTables } from "@/app/actions/tables";
import { createAnalyticsView } from "@/app/actions/analytics";
import { useAIJob } from "@/hooks/use-ai-job";

interface AIAnalyticsCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AIAnalyticsCreator({
  isOpen,
  onClose,
  onSuccess,
}: AIAnalyticsCreatorProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [generatedView, setGeneratedView] = useState<any | null>(null);
  const { dispatch, cancel } = useAIJob();

  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Cancel polling when modal closes (B1)
  useEffect(() => {
    if (!isOpen) cancel();
  }, [isOpen, cancel]);

  useEffect(() => {
    if (isOpen) {
      setPrompt("");
      setGeneratedView(null);
      setError(null);
      getTables().then((res) => {
        if (res.success && res.data) {
          setTables(res.data);

          // Generate Suggestions
          const newSuggestions: string[] = [];

          res.data.forEach((table: any) => {
            let columns: any[] = [];
            // Parsing schema safely
            if (table.schemaJson) {
              if (typeof table.schemaJson === "string") {
                try {
                  columns = JSON.parse(table.schemaJson);
                } catch (e) {}
              } else if (Array.isArray(table.schemaJson)) {
                columns = table.schemaJson;
              }
            }

            // Suggestion 1: Breakdown by Select field
            const selectCol = columns.find((c: any) => c.type === "select");
            if (selectCol) {
              newSuggestions.push(
                `פילוח ${table.name} לפי ${selectCol.label || selectCol.name}`
              );
            }

            // Suggestion 2: Numerical Analysis
            const numberCol = columns.find(
              (c: any) =>
                c.type === "number" ||
                c.name.includes("מחיר") ||
                c.name.includes("amount")
            );
            if (numberCol) {
              newSuggestions.push(
                `סה"כ ${numberCol.label || numberCol.name} מכל ה${table.name}`
              );
            }

            // Suggestion 3: Count over time
            newSuggestions.push(`כמות ${table.name} שהצטרפו בחודש האחרון`);
          });

          // System Model Suggestions
          newSuggestions.push("כמה משימות פתוחות יש לכל עובד?");
          newSuggestions.push("טבלת המרה של לידים למכירות");

          // Randomize and Pick 4
          setSuggestions(
            newSuggestions.sort(() => 0.5 - Math.random()).slice(0, 4)
          );
        }
      });
    }
  }, [isOpen]);

  const handleGenerate = async (text?: string) => {
    const promptToUse = text || prompt;
    if (!promptToUse.trim()) return;

    if (text) setPrompt(text); // visually update input too

    setLoading(true);
    setError(null);
    setGeneratedView(null);

    try {
      const data = await dispatch<{ view: any }>(
        "/api/ai/generate-analytics",
        {
          prompt: promptToUse,
          tables: tables.map((t) => ({
            id: t.id,
            name: t.name,
            schemaJson: t.schemaJson,
          })),
        }
      );

      if (!data.view || !data.view.type || !data.view.config) {
        setError("התוצאה שהתקבלה לא תקינה. נסה לנסח את הבקשה מחדש.");
        setLoading(false);
        return;
      }
      setGeneratedView(data.view);
      setLoading(false);
    } catch (err: any) {
      // Ignore abort errors (from unmount or cancel)
      if (err?.name === "AbortError" || err?.message === "Aborted") {
        setLoading(false);
        return;
      }
      console.error(err);
      setError(getUserFriendlyError(err));
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedView) return;

    setLoading(true);
    try {
      const res = await createAnalyticsView({
        title: generatedView.title,
        type: generatedView.type,
        description: generatedView.description,
        config: generatedView.config,
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError("שגיאה בשמירת התצוגה");
      }
    } catch (err) {
      setError("שגיאה בשמירת התצוגה");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-linear-to-r from-violet-600 to-indigo-600 p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-12 -mb-12 blur-lg" />

          <div className="relative z-10 flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="fill-yellow-400 text-yellow-400 animate-pulse" />
                יצירת דוח חכם עם AI
              </h2>
              <p className="text-indigo-100 mt-1 opacity-90">
                תאר את מה שברצונך לראות, והבינה המלאכותית תבנה את הדוח עבורך.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-2 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
          {!generatedView ? (
            <div className="space-y-6">
              {tables.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="bg-orange-100 p-4 rounded-full">
                    <BarChart2 className="text-orange-600" size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">
                    אין נתונים לניתוח
                  </h3>
                  <p className="text-gray-500 max-w-sm">
                    כדי ליצור דוחות ואנליטיקות, עליך ליצור קודם טבלאות ולהוסיף
                    להן נתונים.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      מה תרצה לנתח?
                    </label>
                    <div className="relative">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="לדוגמה: תראה לי כמה לידים חדשים הצטרפו השבוע בחלוקה למקור הגעה..."
                        className="w-full h-32 p-4 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 resize-none text-gray-800 shadow-sm"
                        autoFocus
                      />
                      <div className="absolute bottom-3 left-3 text-xs text-gray-400">
                        מופעל ע"י Gemini 2.0
                      </div>
                    </div>
                  </div>

                  {suggestions.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        הצעות מותאמות אישית
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleGenerate(suggestion)}
                            className="text-right text-sm p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all text-gray-600 hover:text-indigo-600"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-start gap-4">
                <div className="bg-green-100 p-2 rounded-full text-green-600 mt-1">
                  <Check size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">הדוח נוצר בהצלחה!</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    הנה מה שהמערכת יצרה עבורך בהתבסס על הבקשה.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <BarChart2 size={18} className="text-indigo-600" />
                    תצוגה מקדימה
                  </h4>
                  <span className="text-xs font-medium px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                    {generatedView.type === "CONVERSION"
                      ? "אחוז המרה"
                      : "ספירה/פילוח"}
                  </span>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">
                      כותרת
                    </span>
                    <div className="text-lg font-bold text-gray-900">
                      {generatedView.title}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">
                      תיאור
                    </span>
                    <div className="text-sm text-gray-600">
                      {generatedView.description || "ללא תיאור"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <span className="text-xs text-gray-500 block mb-1">
                        מקור נתונים
                      </span>
                      <div className="font-medium text-gray-800 dir-ltr text-right">
                        {generatedView.config.model === "Task"
                          ? "משימות"
                          : generatedView.config.model ||
                            tables.find(
                              (t) => t.id === generatedView.config.tableId
                            )?.name ||
                            "לא ידוע"}
                      </div>
                    </div>
                    {generatedView.config.groupByField && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <span className="text-xs text-gray-500 block mb-1">
                          קבץ לפי
                        </span>
                        <div className="font-medium text-gray-800">
                          {generatedView.config.groupByField}
                        </div>
                      </div>
                    )}
                  </div>

                  {generatedView.config.dateRangeType && (
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800">
                      <span className="font-bold">טווח זמנים: </span>
                      {generatedView.config.dateRangeType === "all"
                        ? "הכל"
                        : generatedView.config.dateRangeType === "this_week"
                        ? "השבוע"
                        : generatedView.config.dateRangeType === "last_30_days"
                        ? "30 ימים אחרונים"
                        : "מותאם אישית"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3 animate-in fade-in">
              <AlertCircle size={20} />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center gap-4">
          {generatedView ? (
            <>
              <button
                onClick={() => setGeneratedView(null)}
                className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
              >
                נסה שוב
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-8 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:shadow-none flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Check size={20} />
                )}
                אשר ושמור
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => handleGenerate()}
                disabled={loading || !prompt.trim() || tables.length === 0}
                className="px-8 py-2.5 bg-linear-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:opacity-90 transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:shadow-none flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    מעבד...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    צור דוח
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
