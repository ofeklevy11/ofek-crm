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
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
        // Safeguard: ensure fields is an array
        if (!Array.isArray(data.schema.fields)) {
          data.schema.fields = [];
        }
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

  const updateField = (index: number, updates: Partial<FieldRow>) => {
    if (!currentSchema) return;
    const newFields = [...currentSchema.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const removeField = (index: number) => {
    if (!currentSchema) return;
    const newFields = currentSchema.fields.filter((_, i) => i !== index);
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if (!currentSchema) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === currentSchema.fields.length - 1)
      return;

    const newFields = [...currentSchema.fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];

    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const addField = () => {
    if (!currentSchema) return;
    setCurrentSchema({
      ...currentSchema,
      fields: [
        ...currentSchema.fields,
        {
          name: `field_${currentSchema.fields.length + 1}`,
          label: "שדה חדש",
          type: "text",
        },
      ],
    });
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
              : "w-full",
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
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMessages([
                    {
                      role: "model",
                      content:
                        "היי! תאר את הטבלה שתרצה ליצור, ואני אעצב אותה עבורך.",
                    },
                  ]);
                  setCurrentSchema(null);
                  setInput("");
                }}
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
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-bl-none"
                        : "bg-card border border-border text-foreground rounded-br-none",
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
            <div className="flex-1 space-y-6 mb-6 overflow-y-auto pr-2">
              {/* Table Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם הטבלה</Label>
                  <Input
                    value={currentSchema.tableName}
                    onChange={(e) =>
                      setCurrentSchema({
                        ...currentSchema,
                        tableName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>מזהה (Slug)</Label>
                  <Input
                    value={currentSchema.slug}
                    onChange={(e) =>
                      setCurrentSchema({
                        ...currentSchema,
                        slug: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>תיאור</Label>
                  <Input
                    value={currentSchema.description || ""}
                    onChange={(e) =>
                      setCurrentSchema({
                        ...currentSchema,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <TableIcon className="h-4 w-4" />
                  שדות ({currentSchema.fields?.length || 0})
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  className="gap-2"
                >
                  <Plus className="h-3 w-3" /> הוסף שדה
                </Button>
              </div>

              <div className="space-y-3">
                {currentSchema.fields?.map((field, idx) => (
                  <div
                    key={idx}
                    className="bg-muted/30 border border-border rounded-lg p-4 space-y-3 group hover:border-primary/30 transition shadow-sm"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          שם תצוגה
                        </Label>
                        <Input
                          value={field.label}
                          onChange={(e) =>
                            updateField(idx, { label: e.target.value })
                          }
                          className="h-9 bg-white"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          שם במערכת (אנגלית)
                        </Label>
                        <Input
                          value={field.name}
                          onChange={(e) =>
                            updateField(idx, { name: e.target.value })
                          }
                          className="h-9 bg-white font-mono text-xs"
                        />
                      </div>
                      <div className="w-[140px] space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          סוג שדה
                        </Label>
                        <Select
                          value={field.type}
                          onValueChange={(val) =>
                            updateField(idx, { type: val })
                          }
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">טקסט</SelectItem>
                            <SelectItem value="number">מספר</SelectItem>
                            <SelectItem value="date">תאריך</SelectItem>
                            <SelectItem value="boolean">כן/לא</SelectItem>
                            <SelectItem value="select">
                              רשימה (Select)
                            </SelectItem>
                            <SelectItem value="email">אימייל</SelectItem>
                            <SelectItem value="phone">טלפון</SelectItem>
                            <SelectItem value="url">קישור</SelectItem>
                            <SelectItem value="currency">מטבע</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pt-6 flex gap-1">
                        <div className="flex bg-muted rounded-md border border-input p-0.5 h-9 items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveField(idx, "up")}
                            disabled={idx === 0}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
                            title="הזז למעלה"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveField(idx, "down")}
                            disabled={
                              idx === (currentSchema.fields?.length || 0) - 1
                            }
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
                            title="הזז למטה"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeField(idx)}
                          className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {field.type === "select" && (
                      <div className="space-y-1 bg-blue-50/50 p-3 rounded-md border border-blue-100">
                        <Label className="text-xs text-blue-700 font-medium">
                          אפשרויות הבחירה (מופרדות בפסיקים)
                        </Label>
                        <Textarea
                          value={field.options || ""}
                          onChange={(e) =>
                            updateField(idx, { options: e.target.value })
                          }
                          placeholder="אפשרות 1, אפשרות 2, אפשרות 3..."
                          className="bg-white min-h-[60px] text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          הזן את כל האפשרויות שיופיעו ברשימה הנפתחת, מופרדות
                          בפסיק.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
