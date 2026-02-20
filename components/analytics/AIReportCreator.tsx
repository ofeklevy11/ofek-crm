"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  X,
  ArrowRight,
  RotateCcw,
  Loader2,
  Save,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIJob } from "@/hooks/use-ai-job";
import { getTables } from "@/app/actions/tables";
import { createAnalyticsReport } from "@/app/actions/analytics";
import { getUserFriendlyError } from "@/lib/errors";
import ReportPreview from "./ReportPreview";

interface Message {
  role: "user" | "model";
  content: string;
}

interface AIReportView {
  id: string;
  title: string;
  type: "COUNT" | "CONVERSION" | "GRAPH";
  description: string;
  config: Record<string, any>;
}

interface AIReport {
  reportTitle: string;
  summary: string;
  insights: string[];
  views: AIReportView[];
}

interface AIReportCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AIReportCreator({
  isOpen,
  onClose,
  onSuccess,
}: AIReportCreatorProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "היי! אני יכול ליצור עבורך דוח אנליטי מלא עם מספר גרפים, מדדים ותובנות. תאר מה תרצה לנתח ואני אבנה את הדוח.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [report, setReport] = useState<AIReport | null>(null);
  const { dispatch, cancel } = useAIJob();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [suggestions] = useState<string[]>([
    "דוח מקיף על הלקוחות שלי - כמות, חלוקה לפי מקור ומגמות",
    "דוח ביצועי משימות - סטטוסים, עדיפויות וזמני ביצוע",
    "דוח כספי - תשלומים, ריטיינרים ותנועות",
    "דוח שבועי על הפעילות העסקית",
  ]);

  // Load tables on open
  useEffect(() => {
    if (isOpen) {
      getTables().then((res) => {
        if (res.success && res.data) {
          setTables(res.data);
        }
      });
    }
  }, [isOpen]);

  // Cancel polling when modal closes
  useEffect(() => {
    if (!isOpen) cancel();
  }, [isOpen, cancel]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addChatMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "model", content }]);
  }, []);

  const generateUUID = () =>
    "v_" + Math.random().toString(36).substring(2, 11);

  const handleGenerate = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);
    setError(null);

    try {
      const isRefine = report !== null;
      const data = await dispatch<{ report: any }>(
        "/api/ai/generate-analytics",
        {
          prompt: messageToSend,
          tables: tables.map((t) => ({
            id: t.id,
            name: t.name,
            schemaJson: t.schemaJson,
          })),
          mode: isRefine ? "refine" : "report",
          ...(isRefine ? { currentReport: report } : {}),
        }
      );

      if (!data.report || !data.report.views || data.report.views.length === 0) {
        addChatMessage("לא הצלחתי ליצור דוח מהבקשה. נסה לנסח מחדש.");
        setLoading(false);
        return;
      }

      // Add client-side IDs to views
      const viewsWithIds = data.report.views.map((v: any) => ({
        ...v,
        id: generateUUID(),
      }));

      const newReport: AIReport = {
        reportTitle: data.report.reportTitle || "דוח אנליטי",
        summary: data.report.summary || "",
        insights: data.report.insights || [],
        views: viewsWithIds,
      };

      setReport(newReport);
      addChatMessage(
        isRefine
          ? "עדכנתי את הדוח לפי הבקשה שלך. בדוק את התצוגה המקדימה."
          : `יצרתי דוח עם ${viewsWithIds.length} תצוגות. אפשר לערוך כל רכיב או לשלוח בקשה נוספת לשינויים.`
      );
      setLoading(false);
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message === "Aborted") {
        setLoading(false);
        return;
      }
      console.error(err);
      addChatMessage(getUserFriendlyError(err));
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!report || report.views.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const res = await createAnalyticsReport({
        reportTitle: report.reportTitle,
        views: report.views.map((v) => ({
          title: v.title,
          type: v.type,
          description: v.description,
          config: v.config,
        })),
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "שגיאה בשמירת הדוח");
      }
    } catch (err) {
      setError("שגיאה בשמירת הדוח");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateReport = (updates: Partial<AIReport>) => {
    if (!report) return;
    setReport({ ...report, ...updates });
  };

  const handleUpdateView = (viewId: string, updates: Partial<AIReportView>) => {
    if (!report) return;
    setReport({
      ...report,
      views: report.views.map((v) =>
        v.id === viewId ? { ...v, ...updates } : v
      ),
    });
  };

  const handleReset = () => {
    setMessages([
      {
        role: "model",
        content:
          "היי! אני יכול ליצור עבורך דוח אנליטי מלא עם מספר גרפים, מדדים ותובנות. תאר מה תרצה לנתח ואני אבנה את הדוח.",
      },
    ]);
    setReport(null);
    setInput("");
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-7xl h-[90vh] rounded-3xl shadow-2xl flex overflow-hidden border border-border flex-col md:flex-row"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat Panel (Right/Start) */}
        <div
          className={cn(
            "flex flex-col h-full",
            report ? "md:w-[40%] border-b md:border-b-0 md:border-l border-border" : "w-full"
          )}
        >
          <div className="p-5 border-b border-border bg-muted/30 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="text-primary" /> יצירת דוח אנליטי עם AI
              </h2>
              <p className="text-sm text-muted-foreground">
                תאר את הדוח שתרצה, ואני אבנה אותו עם מספר תצוגות ותובנות.
              </p>
            </div>
            <div className="flex gap-2">
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

          <ScrollArea className="flex-1 p-5 bg-muted/10">
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
                      "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-bl-none"
                        : "bg-card border border-border text-foreground rounded-br-none"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm flex gap-2 items-center">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.3s]"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.5s]"></div>
                  </div>
                </div>
              )}
              {/* Suggestions (only show when no report yet and only initial message) */}
              {!report && messages.length === 1 && (
                <div className="grid grid-cols-1 gap-2 px-1 pt-3">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleGenerate(s)}
                      className="text-right text-sm p-3 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all text-muted-foreground hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Chat Input */}
          <div className="p-4 bg-card border-t border-border">
            {error && (
              <div className="mb-3 bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                <p>{error}</p>
              </div>
            )}
            <div className="relative flex gap-2">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder={
                  report
                    ? "בקש שינוי בדוח, למשל: ״שנה את הגרף לעוגה״..."
                    : "תאר את הדוח שברצונך ליצור..."
                }
                className="pl-5 pr-12 py-6 rounded-xl bg-muted/20"
                disabled={loading}
              />
              <Button
                onClick={() => handleGenerate()}
                disabled={loading || !input.trim()}
                size="icon"
                className="absolute left-2 top-2 h-8 w-8 rounded-lg"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Report Preview Panel (Left/End) */}
        {report && (
          <div className="flex-1 overflow-hidden flex flex-col md:w-[60%] h-full">
            <div className="p-5 border-b border-border bg-muted/30 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                תצוגה מקדימה — {report.views.length} תצוגות
              </div>
              <Button
                onClick={handleSave}
                disabled={saving || loading}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                שמור דוח
              </Button>
            </div>

            <ScrollArea className="flex-1 p-5">
              <ReportPreview
                report={report}
                tables={tables}
                onUpdateReport={handleUpdateReport}
                onUpdateView={handleUpdateView}
              />
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
