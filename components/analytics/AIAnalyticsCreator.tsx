"use client";

import { useState, useEffect, useRef } from "react";
import { getUserFriendlyError } from "@/lib/errors";
import {
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  BarChart2,
  Check,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  PanelLeftClose,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getTables } from "@/app/actions/tables";
import { createAnalyticsView } from "@/app/actions/analytics";
import { useAIJob } from "@/hooks/use-ai-job";
import CreateAnalyticsViewModal from "./CreateAnalyticsViewModal";

const SYSTEM_MODEL_NAMES: Record<string, string> = {
  Task: "משימות",
  Retainer: "ריטיינרים",
  OneTimePayment: "תשלומים חד-פעמיים",
  Transaction: "תנועות כספיות",
  CalendarEvent: "אירועי יומן",
};

const CHART_TYPE_NAMES: Record<string, string> = {
  bar: "עמודות",
  line: "קו",
  pie: "עוגה",
  area: "שטח",
};

interface Message {
  role: "user" | "model";
  content: string;
}

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
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", content: "היי! תאר את מה שברצונך לראות, ואני אבנה את הדוח עבורך." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [generatedView, setGeneratedView] = useState<any | null>(null);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isManualEditOpen, setIsManualEditOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const { dispatch, cancel } = useAIJob();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cancel polling when modal closes
  useEffect(() => {
    if (!isOpen) cancel();
  }, [isOpen, cancel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    let stale = false;
    handleReset();
    setInitialLoading(true);

    getTables().then((res) => {
      if (stale) return;
      if (res.success && res.data) {
        setTables(res.data);

        // Generate Suggestions
        const newSuggestions: string[] = [];

        res.data.forEach((table: any) => {
          let columns: any[] = [];
          if (table.schemaJson) {
            if (typeof table.schemaJson === "string") {
              try {
                columns = JSON.parse(table.schemaJson);
              } catch (e) {}
            } else if (Array.isArray(table.schemaJson)) {
              columns = table.schemaJson;
            }
          }

          const selectCol = columns.find((c: any) => c.type === "select");
          if (selectCol) {
            newSuggestions.push(
              `פילוח ${table.name} לפי ${selectCol.label || selectCol.name}`
            );
          }

          const numberCol = columns.find(
            (c: any) =>
              c.type === "number" ||
              c.name.includes("מחיר") ||
              c.name.includes("amount")
          );
          if (numberCol) {
            newSuggestions.push(
              `גרף עמודות של סה"כ ${numberCol.label || numberCol.name} לפי ${selectCol?.label || "קטגוריה"} מ${table.name}`
            );
          }

          newSuggestions.push(`כמות ${table.name} שהצטרפו בחודש האחרון`);

          if (selectCol) {
            newSuggestions.push(
              `גרף עוגה של חלוקת ${table.name} לפי ${selectCol.label || selectCol.name}`
            );
          }
        });

        // System Model Suggestions
        newSuggestions.push("גרף עמודות של משימות לפי סטטוס");
        newSuggestions.push("חלוקת משימות לפי עדיפות");
        newSuggestions.push("אחוז המרה של תשלומים ששולמו");
        newSuggestions.push("גרף עוגה של ריטיינרים לפי תדירות");

        // Randomize and Pick 4
        setSuggestions(
          newSuggestions.sort(() => 0.5 - Math.random()).slice(0, 4)
        );
      }
      setInitialLoading(false);
    });

    return () => { stale = true; };
  }, [isOpen]);

  const handleReset = () => {
    setMessages([
      { role: "model", content: "היי! תאר את מה שברצונך לראות, ואני אבנה את הדוח עבורך." },
    ]);
    setGeneratedView(null);
    setInput("");
    setError(null);
    setChatMinimized(false);
    setAiSuggestions([]);
    setLoadingSuggestions(false);
  };

  const addChatMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: "model", content }]);
  };

  const handleGetSuggestions = async () => {
    if (loadingSuggestions || loading) return;
    setLoadingSuggestions(true);
    setError(null);

    try {
      const data = await dispatch<{ suggestions: any[] }>(
        "/api/ai/generate-analytics",
        {
          prompt: "",
          mode: "suggestions",
          tables: tables.map((t) => ({
            id: t.id,
            name: t.name,
            schemaJson: t.schemaJson,
          })),
        }
      );

      if (data.suggestions && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        addChatMessage(`מצאתי ${data.suggestions.length} הצעות חכמות מבוססות על הנתונים שלך. בחר אחת מהן בצד שמאל.`);
      } else {
        addChatMessage("לא הצלחתי ליצור הצעות. נסה לתאר מה ברצונך לראות.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message === "Aborted") {
        setLoadingSuggestions(false);
        return;
      }
      console.error(err);
      const isRateLimited = err?.message === "RATE_LIMITED" || err?.message?.includes("Rate limit");
      if (isRateLimited) {
        setError("יותר מדי בקשות. אנא נסה שוב בעוד 2 דקות והנתונים יוצגו.");
        setTimeout(() => setError(null), 10000);
      }
      const errMsg = err?.message && err.message !== "Aborted"
        ? `שגיאה: ${getUserFriendlyError(err)}`
        : "מצטערים, משהו השתבש. אנא נסה שנית.";
      addChatMessage(errMsg);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    setGeneratedView(suggestion);
    setChatMinimized(true);
    setAiSuggestions([]);
    addChatMessage(`בחרת את "${suggestion.title}". בדוק את התצוגה המקדימה.`);
  };

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);
    setError(null);

    try {
      const isRefine = !!generatedView;
      const payload: Record<string, any> = {
        prompt: messageToSend,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          schemaJson: t.schemaJson,
        })),
      };

      if (isRefine) {
        payload.mode = "single-refine";
        payload.currentView = generatedView;
      }

      const data = await dispatch<{ view: any }>(
        "/api/ai/generate-analytics",
        payload
      );

      if (!data.view || !data.view.type || !data.view.config) {
        addChatMessage("התוצאה שהתקבלה לא תקינה. נסה לנסח את הבקשה מחדש.");
        setLoading(false);
        return;
      }
      setGeneratedView(data.view);
      setChatMinimized(true);
      addChatMessage(
        isRefine
          ? `עדכנתי את הדוח בהתאם לבקשתך. בדוק את התצוגה המקדימה.`
          : `יצרתי את הדוח "${data.view.title}". בדוק את התצוגה המקדימה.`
      );
      setLoading(false);
    } catch (err: any) {
      // Ignore abort errors (from unmount or cancel)
      if (err?.name === "AbortError" || err?.message === "Aborted") {
        setLoading(false);
        return;
      }
      console.error(err);
      const isRateLimited = err?.message === "RATE_LIMITED" || err?.message?.includes("Rate limit");
      if (isRateLimited) {
        setError("יותר מדי בקשות. אנא נסה שוב בעוד 2 דקות והנתונים יוצגו.");
        setTimeout(() => setError(null), 10000);
      }
      const errMsg = err?.message && err.message !== "Aborted"
        ? `שגיאה: ${getUserFriendlyError(err)}`
        : "מצטערים, משהו השתבש. אנא נסה שנית.";
      addChatMessage(errMsg);
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
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-card w-full max-h-[90vh] rounded-3xl shadow-2xl flex overflow-hidden border border-border flex-col md:flex-row",
          generatedView || aiSuggestions.length > 0 ? "max-w-6xl" : "max-w-2xl"
        )}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat Section */}
        {generatedView && chatMinimized ? null : (
          <div
            className={cn(
              "flex flex-col flex-1 h-full",
              generatedView
                ? "md:w-1/2 border-b md:border-b-0 md:border-l border-border"
                : "w-full"
            )}
          >
            <div className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="text-primary" /> יצירת אנליטיקה חכמה עם AI
                </h2>
                <p className="text-sm text-muted-foreground">
                  תאר את מה שברצונך לראות, ואני אבנה את האנליטיקה עבורך.
                </p>
              </div>
              <div className="flex gap-2">
                {generatedView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setChatMinimized(true)}
                    className="text-muted-foreground hover:text-foreground"
                    title="מזער צ'אט"
                  >
                    <PanelLeftClose className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-muted-foreground hover:text-foreground gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  התחל מחדש
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6 bg-muted/10">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-bl-none"
                          : "bg-card border border-border text-foreground rounded-br-none"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {(loading || loadingSuggestions) && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm flex gap-2 items-center">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.3s]"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.5s]"></div>
                    </div>
                  </div>
                )}
                {initialLoading && messages.length === 1 && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm flex gap-2 items-center">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.3s]"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.5s]"></div>
                    </div>
                  </div>
                )}
                {!initialLoading && !generatedView && !loadingSuggestions && aiSuggestions.length === 0 && tables.length > 0 && (
                  <div className="flex justify-center pt-4 px-2">
                    <button
                      onClick={handleGetSuggestions}
                      disabled={loading}
                      className="flex items-center gap-2 px-5 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-primary font-medium text-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="h-4 w-4" />
                      קבל הצעות חכמות מבוססות על הנתונים שלך
                    </button>
                  </div>
                )}
                {!initialLoading && messages.length === 1 && suggestions.length > 0 && tables.length > 0 && aiSuggestions.length === 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-2 pt-4">
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(suggestion)}
                        className="text-right text-sm p-3 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all text-muted-foreground hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                {tables.length === 0 && !loading && messages.length === 1 && (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-muted/20 border border-border rounded-xl">
                    <div className="bg-orange-100 p-4 rounded-full">
                      <BarChart2 className="text-orange-600" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">
                      אין נתונים לניתוח
                    </h3>
                    <p className="text-muted-foreground max-w-sm">
                      כדי ליצור דוחות ואנליטיקות, עליך ליצור קודם טבלאות ולהוסיף
                      להן נתונים.
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {error && (
              <div className="mx-6 mb-2 bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-xl flex items-center gap-3 animate-in fade-in">
                <AlertCircle size={18} />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="p-4 bg-card border-t border-border">
              <div className="relative flex gap-2">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={
                    generatedView
                      ? "בקש שינוי, למשל: שנה לגרף עוגה..."
                      : "למשל: גרף עמודות של לידים לפי סטטוס..."
                  }
                  className="pl-5 pr-12 py-6 rounded-xl bg-muted/20"
                  autoFocus
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim() || tables.length === 0}
                  size="icon"
                  className="absolute left-2 top-2 h-8 w-8 rounded-lg"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* AI Suggestions Panel */}
        {aiSuggestions.length > 0 && !generatedView && (
          <div className="flex-1 overflow-y-auto bg-card border-r border-border flex flex-col min-h-0 md:w-1/2">
            <div className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="text-primary h-5 w-5" />
                הצעות חכמות
                <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {aiSuggestions.length}
                </span>
              </h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {aiSuggestions.map((sugg, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectSuggestion(sugg)}
                    className="w-full text-right p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {sugg.title}
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 bg-primary/10 text-primary rounded-full whitespace-nowrap shrink-0">
                        {sugg.type === "CONVERSION"
                          ? "אחוז המרה"
                          : sugg.type === "GRAPH"
                          ? `גרף ${CHART_TYPE_NAMES[sugg.config?.chartType] || ""}`
                          : "ספירה/פילוח"}
                      </span>
                    </div>
                    {sugg.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {sugg.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {sugg.config?.model && (
                        <span className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                          {SYSTEM_MODEL_NAMES[sugg.config.model] || sugg.config.model}
                        </span>
                      )}
                      {sugg.config?.tableId && (
                        <span className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                          {tables.find((t) => t.id === sugg.config.tableId)?.name || `טבלה ${sugg.config.tableId}`}
                        </span>
                      )}
                      {sugg.config?.groupByField && (
                        <span className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                          לפי: {sugg.config.groupByField}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Preview Section */}
        {generatedView && (
          <div
            className={cn(
              "flex-1 overflow-y-auto bg-card border-r border-border flex flex-col min-h-0",
              chatMinimized ? "w-full" : "md:w-1/2"
            )}
          >
            {chatMinimized && (
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatMinimized(false)}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    שוחח עם AI
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="text-muted-foreground hover:text-foreground gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    התחל מחדש
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}

            <div className="flex-1 p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-xl p-4 flex items-start gap-4">
                <div className="bg-green-100 dark:bg-green-900 p-2 rounded-full text-green-600 dark:text-green-400 mt-1">
                  <Check size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">הדוח נוצר בהצלחה!</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    הנה מה שהמערכת יצרה עבורך בהתבסס על הבקשה.
                  </p>
                </div>
              </div>

              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <BarChart2 size={18} className="text-primary" />
                    תצוגה מקדימה
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsManualEditOpen(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      ערוך את האנליטיקה
                    </Button>
                  <span className="text-xs font-medium px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                    {generatedView.type === "CONVERSION"
                      ? "אחוז המרה"
                      : generatedView.type === "GRAPH"
                      ? `גרף ${CHART_TYPE_NAMES[generatedView.config.chartType] || "עמודות"}`
                      : "ספירה/פילוח"}
                  </span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">
                      כותרת
                    </span>
                    <div className="text-lg font-bold text-foreground">
                      {generatedView.title}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">
                      תיאור
                    </span>
                    <div className="text-sm text-muted-foreground">
                      {generatedView.description || "ללא תיאור"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <span className="text-xs text-muted-foreground block mb-1">
                        מקור נתונים
                      </span>
                      <div className="font-medium text-foreground text-right">
                        {generatedView.config.model
                          ? SYSTEM_MODEL_NAMES[generatedView.config.model] || generatedView.config.model
                          : tables.find(
                              (t) => t.id === generatedView.config.tableId
                            )?.name ||
                            "לא ידוע"}
                      </div>
                    </div>
                    {generatedView.config.groupByField && (
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <span className="text-xs text-muted-foreground block mb-1">
                          קבץ לפי
                        </span>
                        <div className="font-medium text-foreground">
                          {generatedView.config.groupByField}
                        </div>
                      </div>
                    )}
                    {generatedView.type === "GRAPH" && generatedView.config.chartType && (
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <span className="text-xs text-muted-foreground block mb-1">
                          סוג גרף
                        </span>
                        <div className="font-medium text-foreground">
                          {CHART_TYPE_NAMES[generatedView.config.chartType] || generatedView.config.chartType}
                        </div>
                      </div>
                    )}
                    {generatedView.type === "GRAPH" && generatedView.config.yAxisMeasure && (
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <span className="text-xs text-muted-foreground block mb-1">
                          מדד
                        </span>
                        <div className="font-medium text-foreground">
                          {generatedView.config.yAxisMeasure === "count"
                            ? "ספירה"
                            : generatedView.config.yAxisMeasure === "sum"
                            ? `סכום (${generatedView.config.yAxisField || ""})`
                            : `ממוצע (${generatedView.config.yAxisField || ""})`}
                        </div>
                      </div>
                    )}
                  </div>

                  {generatedView.config.dateRangeType && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                      <span className="font-bold">טווח זמנים: </span>
                      {generatedView.config.dateRangeType === "all"
                        ? "הכל"
                        : generatedView.config.dateRangeType === "this_week"
                        ? "השבוע"
                        : generatedView.config.dateRangeType === "last_30_days"
                        ? "30 ימים אחרונים"
                        : generatedView.config.dateRangeType === "last_year"
                        ? "שנה אחרונה"
                        : "מותאם אישית"}
                    </div>
                  )}

                  {generatedView.type === "CONVERSION" && (
                    <div className="space-y-2">
                      {generatedView.config.totalFilter && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 p-3 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                          <span className="font-bold">סינון כולל: </span>
                          {Object.entries(generatedView.config.totalFilter)
                            .map(([k, v]) => `${k} = ${v}`)
                            .join(", ")}
                        </div>
                      )}
                      {generatedView.config.successFilter && (
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 p-3 rounded-lg text-sm text-green-800 dark:text-green-300">
                          <span className="font-bold">סינון הצלחה: </span>
                          {Object.entries(generatedView.config.successFilter)
                            .map(([k, v]) => `${k} = ${v}`)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Preview Footer */}
            <div className="pt-5 pb-4 px-5 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 h-10"
              >
                ביטול
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setChatMinimized(false);
                }}
                className="flex-1 h-10 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                חזור לצ'אט
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-[2] h-10 gap-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  <Check size={18} />
                )}
                אשר ושמור
              </Button>
            </div>
          </div>
        )}
      </div>

      {generatedView && (
        <CreateAnalyticsViewModal
          isOpen={isManualEditOpen}
          onClose={() => setIsManualEditOpen(false)}
          onSuccess={() => {
            onSuccess();
            onClose();
          }}
          initialData={{
            title: generatedView.title,
            type: generatedView.type,
            config: generatedView.config,
          }}
        />
      )}
    </div>
  );
}
