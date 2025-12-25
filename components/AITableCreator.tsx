"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Send,
  X,
  ArrowRight,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  content: string;
}

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options?: string;
  defaultValue?: string;
  relationTableId?: number;
  displayField?: string;
  allowMultiple?: boolean;
}

interface TableSchema {
  tableName: string;
  slug: string;
  description?: string;
  fields: FieldRow[];
}

interface AITableCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AITableCreator({
  isOpen,
  onClose,
}: AITableCreatorProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content: "היי! תאר את הטבלה שתרצה ליצור, ואני אעצב אותה עבורך.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<TableSchema | null>(null);
  const [existingTablesStr, setExistingTablesStr] = useState("");
  const [creating, setCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Load context
      const loadContext = async () => {
        try {
          const { getTables } = await import("@/app/actions");
          const res = await getTables();
          if (res.success && res.data) {
            const tablesSummary = res.data
              .map((t) => `${t.name} (ID: ${t.id})`)
              .join(", ");
            setExistingTablesStr(tablesSummary);
          }
        } catch (e) {
          console.error("Failed to load tables context", e);
        }
      };
      loadContext();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/generate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: messageToSend,
          existingTables: existingTablesStr,
          currentSchema: currentSchema,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate schema");
      }

      if (data.schema) {
        setCurrentSchema(data.schema);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: `יצרתי/עדכנתי את הסכמה עבור "${data.schema.tableName}". בדוק את התצוגה המקדימה מצד שמאל.`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: "לא הצלחתי להבין את הבקשה. נסה לתאר בצורה מפורטת יותר.",
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "מצטערים, משהו השתבש. אנא נסה שנית.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!currentSchema) return;
    setCreating(true);

    try {
      const refinedFields = currentSchema.fields.map((f) => ({
        ...f,
        options: f.options
          ? f.options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        relationTableId: f.relationTableId
          ? Number(f.relationTableId)
          : undefined,
      }));

      const { createTable } = await import("@/app/actions");
      const result = await createTable({
        name: currentSchema.tableName,
        slug: currentSchema.slug,
        schemaJson: refinedFields as any,
        categoryId: undefined, // AI doesn't categorize for now
      });

      if (result.success) {
        onClose();
        router.refresh();
      } else {
        alert("נכשל ביצירת טבלה: " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("שגיאה ביצירת הטבלה");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-card w-full max-w-6xl h-[80vh] rounded-3xl shadow-2xl flex overflow-hidden border border-border flex-col md:flex-row"
        dir="rtl"
      >
        {/* Chat Section */}
        <div
          className={cn(
            "flex flex-col flex-1 h-full",
            currentSchema
              ? "md:w-1/2 border-b md:border-b-0 md:border-l border-border"
              : "w-full"
          )}
        >
          <div className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="text-primary" /> יוצר טבלאות AI
              </h2>
              <p className="text-sm text-muted-foreground">
                תאר מה שאתה צריך, ואני אבנה את זה.
              </p>
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
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm flex gap-2 items-center">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.3s]"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-.5s]"></div>
                  </div>
                </div>
              )}
              {messages.length === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-2 pt-4">
                  {[
                    "טבלת לידים לסוכנות שיווק (שם, טלפון, מקור, סטטוס, תקציב)",
                    "מעקב הוצאות והכנסות (תאריך, סכום, קטגוריה, סוג, חשבונית)",
                    "ניהול מלאי מוצרים (שם, מק'ט, כמות, מחיר עלות, מחיר מכירה, ספק)",
                    "ניהול פרויקטים ומשימות (שם משימה, אחראי, דד-ליין, עדיפות, סטטוס)",
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
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

          <div className="p-4 bg-card border-t border-border">
            <div className="relative flex gap-2">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="למשל: טבלת CRM ללידים בנדל״ן..."
                className="pl-5 pr-12 py-6 rounded-xl bg-muted/20"
              />
              <Button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                size="icon"
                className="absolute left-2 top-2 h-8 w-8 rounded-lg"
              >
                <ArrowRight className="h-4 w-4" />{" "}
                {/* RTL arrow might need Left, but usually send is forward */}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {currentSchema && (
          <div className="flex-1 overflow-y-auto bg-card border-r border-border p-8 flex flex-col md:w-1/2 h-full">
            <div className="mb-6 pb-6 border-b border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">
                    תצוגה מקדימה
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {currentSchema.tableName}
                  </h3>
                </div>
                <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-mono">
                  {currentSchema.slug}
                </span>
              </div>
              {currentSchema.description && (
                <p className="text-muted-foreground">
                  {currentSchema.description}
                </p>
              )}
            </div>

            <div className="flex-1 space-y-3 mb-6 overflow-y-auto pr-2">
              <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <TableIcon className="h-4 w-4" />
                שדות ({currentSchema.fields.length})
              </h4>
              {currentSchema.fields.map((field, idx) => (
                <div
                  key={idx}
                  className="bg-muted/30 border border-border rounded-lg p-3 flex items-center justify-between group hover:border-primary/30 transition"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {field.label}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {field.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-background text-muted-foreground border border-border px-2 py-0.5 rounded shadow-sm">
                      {field.type}
                    </span>
                    {field.options && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                        רשימה
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentSchema(null)}
                className="flex-1 h-12"
              >
                ביטול
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="flex-[2] h-12 gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    יוצר טבלה...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    צור טבלה
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
