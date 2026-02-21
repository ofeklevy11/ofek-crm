"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  X,
  ArrowRight,
  Table as TableIcon,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageSquare,
  PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIJob } from "@/hooks/use-ai-job";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TabDefinition, TabsConfig, DisplayConfig } from "@/lib/types/table-tabs";

interface Message {
  role: "user" | "model";
  content: string;
}

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options?: string[];
  optionColors?: Record<string, string>;
  defaultValue?: string;
  relationTableId?: number;
  displayField?: string;
  allowMultiple?: boolean;
  relationField?: string;
  lookupField?: string;
  min?: number;
  max?: number;
  tab?: string;
}

interface TableSchema {
  tableName: string;
  slug: string;
  description?: string;
  categoryId?: number | null;
  fields: FieldRow[];
  tabsConfig?: TabsConfig | null;
  displayConfig?: DisplayConfig | null;
}

interface TableOption {
  id: number;
  name: string;
  schemaJson: any;
}

interface CategoryOption {
  id: number;
  name: string;
}

const FIELD_TYPES = [
  { value: "text", label: "טקסט" },
  { value: "textarea", label: "טקסט ארוך" },
  { value: "number", label: "מספר" },
  { value: "date", label: "תאריך" },
  { value: "boolean", label: "כן/לא" },
  { value: "phone", label: "טלפון" },
  { value: "url", label: "קישור (URL)" },
  { value: "select", label: "בחירה (Select)" },
  { value: "multi-select", label: "בחירה מרובה" },
  { value: "tags", label: "תגיות" },
  { value: "radio", label: "כפתורי רדיו" },
  { value: "score", label: "ניקוד (מדידה)" },
  { value: "relation", label: "קשר (Relation)" },
  { value: "lookup", label: "חיפוש (Lookup)" },
  { value: "record_owner", label: "אחראי רשומה" },
  { value: "automation", label: "טריגר אוטומציה" },
] as const;

const SELECT_LIKE_TYPES = new Set(["select", "multi-select", "radio", "tags", "record_owner"]);

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
  const [creating, setCreating] = useState(false);
  const { dispatch, cancel } = useAIJob();

  // Context data loaded on open
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // Collapsible sections
  const [showTabs, setShowTabs] = useState(false);
  const [showDisplayConfig, setShowDisplayConfig] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const loadContext = async () => {
        try {
          const { getTables, getCategories } = await import("@/app/actions");
          const [tablesRes, catRes] = await Promise.all([
            getTables(),
            getCategories(),
          ]);
          if (tablesRes.success && tablesRes.data) {
            setAvailableTables(tablesRes.data);
          }
          if (catRes.success && catRes.data) {
            setCategories(catRes.data);
          }
        } catch (e) {
          console.error("Failed to load context", e);
        }
      };
      loadContext();
    }
  }, [isOpen]);

  // Cancel polling when modal closes
  useEffect(() => {
    if (!isOpen) cancel();
  }, [isOpen, cancel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addChatMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: "model", content }]);
  };

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);

    try {
      const data = await dispatch<{ schema: TableSchema }>(
        "/api/ai/generate-schema",
        {
          prompt: messageToSend,
          currentSchema: currentSchema,
        }
      );

      if (data.schema) {
        if (!Array.isArray(data.schema.fields)) {
          data.schema.fields = [];
        }
        // Normalize options from AI (might come as string arrays already from backend validation)
        data.schema.fields = data.schema.fields.map((f) => ({
          ...f,
          options: Array.isArray(f.options)
            ? f.options
            : typeof f.options === "string" && f.options
              ? (f.options as string).split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined,
        }));

        if (data.schema.fields.length === 0) {
          addChatMessage("לא הצלחתי ליצור שדות לטבלה. נסה לתאר שוב מה הטבלה צריכה להכיל.");
          setLoading(false);
          return;
        }
        setCurrentSchema(data.schema);
        setChatMinimized(true);
        // Auto-expand tabs section if AI generated tabs
        if (data.schema.tabsConfig?.enabled) setShowTabs(true);
        addChatMessage(`יצרתי/עדכנתי את הסכמה עבור "${data.schema.tableName}". בדוק את התצוגה המקדימה מצד שמאל.`);
      } else {
        addChatMessage("לא הצלחתי להבין את הבקשה. נסה לתאר בצורה מפורטת יותר.");
      }
      setLoading(false);
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.message === "Aborted") {
        setLoading(false);
        return;
      }
      console.error(error);
      const errMsg = error?.message && error.message !== "Aborted"
        ? `שגיאה: ${error.message}`
        : "מצטערים, משהו השתבש. אנא נסה שנית.";
      addChatMessage(errMsg);
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
    const removed = currentSchema.fields[index];
    const newFields = currentSchema.fields.filter((_, i) => i !== index);

    // Update displayConfig if it references the removed field
    let newDisplayConfig = currentSchema.displayConfig;
    if (newDisplayConfig && removed) {
      const vis = newDisplayConfig.visibleColumns.filter((n) => n !== removed.name);
      const ord = newDisplayConfig.columnOrder.filter((n) => n !== removed.name);
      newDisplayConfig = vis.length > 0 ? { visibleColumns: vis, columnOrder: ord } : null;
    }

    setCurrentSchema({ ...currentSchema, fields: newFields, displayConfig: newDisplayConfig });
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if (!currentSchema) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === currentSchema.fields.length - 1) return;

    const newFields = [...currentSchema.fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const addField = () => {
    if (!currentSchema) return;
    setCurrentSchema({
      ...currentSchema,
      fields: [
        ...currentSchema.fields,
        { name: `field_${currentSchema.fields.length + 1}`, label: "שדה חדש", type: "text" },
      ],
    });
  };

  // --- Tab helpers ---
  const addTab = () => {
    if (!currentSchema) return;
    const tabs = currentSchema.tabsConfig?.tabs || [];
    if (tabs.length >= 20) return;
    const newTab: TabDefinition = {
      id: `tab_${Math.random().toString(36).substring(2, 8)}`,
      label: `טאב ${tabs.length + 1}`,
      order: tabs.length,
    };
    setCurrentSchema({
      ...currentSchema,
      tabsConfig: { enabled: true, tabs: [...tabs, newTab] },
    });
  };

  const removeTab = (tabId: string) => {
    if (!currentSchema?.tabsConfig) return;
    const remaining = currentSchema.tabsConfig.tabs.filter((t) => t.id !== tabId);
    const newFields = currentSchema.fields.map((f) =>
      f.tab === tabId ? { ...f, tab: remaining.length > 0 ? remaining[0].id : undefined } : f
    );
    setCurrentSchema({
      ...currentSchema,
      fields: newFields,
      tabsConfig: remaining.length > 0
        ? { enabled: true, tabs: remaining.map((t, i) => ({ ...t, order: i })) }
        : null,
    });
  };

  const renameTab = (tabId: string, label: string) => {
    if (!currentSchema?.tabsConfig) return;
    setCurrentSchema({
      ...currentSchema,
      tabsConfig: {
        ...currentSchema.tabsConfig,
        tabs: currentSchema.tabsConfig.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
      },
    });
  };

  // --- Display config helpers ---
  const toggleDisplayColumn = (fieldName: string) => {
    if (!currentSchema) return;
    const dc = currentSchema.displayConfig || { visibleColumns: [], columnOrder: [] };
    const isVisible = dc.visibleColumns.includes(fieldName);
    let newVisible: string[];
    let newOrder: string[];
    if (isVisible) {
      newVisible = dc.visibleColumns.filter((n) => n !== fieldName);
      newOrder = dc.columnOrder.filter((n) => n !== fieldName);
    } else {
      if (dc.visibleColumns.length >= 12) return; // max 12
      newVisible = [...dc.visibleColumns, fieldName];
      newOrder = [...dc.columnOrder, fieldName];
    }
    setCurrentSchema({
      ...currentSchema,
      displayConfig: newVisible.length > 0 ? { visibleColumns: newVisible, columnOrder: newOrder } : null,
    });
  };

  // --- Get related table schema for relation/lookup editors ---
  const getRelatedTableSchema = (tableId: number | string | undefined) => {
    if (!tableId) return [];
    const table = availableTables.find((t) => t.id === Number(tableId));
    if (!table?.schemaJson) return [];
    try {
      const schema = typeof table.schemaJson === "string" ? JSON.parse(table.schemaJson) : table.schemaJson;
      return Array.isArray(schema) ? schema : [];
    } catch {
      return [];
    }
  };

  const handleCreate = async () => {
    if (!currentSchema) return;
    setCreating(true);

    try {
      const schemaJson = currentSchema.fields.map((f) => {
        const isSelectType = SELECT_LIKE_TYPES.has(f.type);
        const base: any = {
          name: f.name,
          type: f.type === "record_owner" ? "select" : f.type,
          label: f.label,
        };

        if (f.defaultValue) base.defaultValue = f.defaultValue;
        if (f.tab) base.tab = f.tab;

        if (isSelectType && Array.isArray(f.options) && f.options.length > 0) {
          base.options = [...new Set(f.options.filter(Boolean))];
          if (f.optionColors && Object.keys(f.optionColors).length > 0) {
            base.optionColors = f.optionColors;
          }
        }

        if (f.type === "score") {
          base.min = typeof f.min === "number" ? f.min : 0;
          base.max = typeof f.max === "number" ? f.max : 10;
        }

        if (f.type === "relation" && f.relationTableId) {
          base.relationTableId = Number(f.relationTableId);
          if (f.displayField) base.displayField = f.displayField;
          if (f.allowMultiple) base.allowMultiple = true;
        }

        if (f.type === "lookup") {
          if (f.relationField) base.relationField = f.relationField;
          if (f.lookupField) base.lookupField = f.lookupField;
        }

        return base;
      });

      const tabsConfigPayload: TabsConfig | undefined =
        currentSchema.tabsConfig?.enabled && currentSchema.tabsConfig.tabs.length > 0
          ? currentSchema.tabsConfig
          : undefined;

      const { createTable } = await import("@/app/actions");
      const result = await createTable({
        name: currentSchema.tableName,
        slug: currentSchema.slug,
        schemaJson: schemaJson as any,
        categoryId: currentSchema.categoryId ?? undefined,
        tabsConfig: tabsConfigPayload as any,
        displayConfig: currentSchema.displayConfig as any,
      });

      if (result.success) {
        onClose();
        router.refresh();
      } else {
        addChatMessage("נכשל ביצירת טבלה: " + (result.error || "שגיאה לא ידועה"));
      }
    } catch (e: any) {
      console.error(e);
      addChatMessage("שגיאה ביצירת הטבלה: " + (e?.message || "שגיאה לא ידועה"));
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const tabs = currentSchema?.tabsConfig?.tabs || [];

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-6xl max-h-[80vh] rounded-3xl shadow-2xl flex overflow-hidden border border-border flex-col md:flex-row"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat Section */}
        {currentSchema && chatMinimized ? null : (
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
                {currentSchema && (
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
                  onClick={() => {
                    setMessages([
                      {
                        role: "model",
                        content: "היי! תאר את הטבלה שתרצה ליצור, ואני אעצב אותה עבורך.",
                      },
                    ]);
                    setCurrentSchema(null);
                    setInput("");
                    setShowTabs(false);
                    setShowDisplayConfig(false);
                    setChatMinimized(false);
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
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="למשל: טבלת CRM ללידים בנדל״ן..."
                  className="pl-5 pr-12 py-6 rounded-xl bg-muted/20 min-h-[9rem]"
                  rows={6}
                  style={{ resize: "none" }}
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  size="icon"
                  className="absolute left-2 bottom-2 h-8 w-8 rounded-lg"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {currentSchema && (
          <div className={cn(
            "flex-1 overflow-y-auto bg-card border-r border-border flex flex-col min-h-0",
            chatMinimized ? "w-full" : "md:w-1/2"
          )}>
            {chatMinimized && (
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatMinimized(false)}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    פתח צ׳אט
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMessages([
                        {
                          role: "model",
                          content: "היי! תאר את הטבלה שתרצה ליצור, ואני אעצב אותה עבורך.",
                        },
                      ]);
                      setCurrentSchema(null);
                      setInput("");
                      setShowTabs(false);
                      setShowDisplayConfig(false);
                      setChatMinimized(false);
                    }}
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
            <div className="flex-1 space-y-6 mb-6 pr-2 p-8">
              {/* Table Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם הטבלה</Label>
                  <Input
                    value={currentSchema.tableName}
                    onChange={(e) =>
                      setCurrentSchema({ ...currentSchema, tableName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>מזהה (Slug)</Label>
                  <Input
                    value={currentSchema.slug}
                    onChange={(e) =>
                      setCurrentSchema({ ...currentSchema, slug: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>תיאור</Label>
                  <Input
                    value={currentSchema.description || ""}
                    onChange={(e) =>
                      setCurrentSchema({ ...currentSchema, description: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>קטגוריה</Label>
                  <select
                    value={currentSchema.categoryId || ""}
                    onChange={(e) =>
                      setCurrentSchema({
                        ...currentSchema,
                        categoryId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">ללא קטגוריה</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabs Section (Collapsible) */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTabs(!showTabs)}
                  className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-muted/40 transition text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    טאבים {tabs.length > 0 && `(${tabs.length})`}
                  </span>
                  {showTabs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showTabs && (
                  <div className="p-3 space-y-2 border-t border-border">
                    {tabs.map((tab) => (
                      <div key={tab.id} className="flex items-center gap-2">
                        <Input
                          value={tab.label}
                          onChange={(e) => renameTab(tab.id, e.target.value)}
                          className="h-8 flex-1"
                          placeholder="שם הטאב"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removeTab(tab.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addTab}
                      disabled={tabs.length >= 20}
                      className="gap-2"
                    >
                      <Plus className="h-3 w-3" /> הוסף טאב
                    </Button>
                  </div>
                )}
              </div>

              {/* DisplayConfig Section (Collapsible) */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDisplayConfig(!showDisplayConfig)}
                  className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-muted/40 transition text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    עמודות מוצגות ({currentSchema.displayConfig?.visibleColumns.length || 0}/{currentSchema.fields.length})
                  </span>
                  {showDisplayConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showDisplayConfig && (
                  <div className="p-3 space-y-1 border-t border-border max-h-48 overflow-y-auto">
                    {currentSchema.fields.map((f) => {
                      const isVisible = currentSchema.displayConfig?.visibleColumns.includes(f.name) ?? false;
                      return (
                        <label key={f.name} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleDisplayColumn(f.name)}
                            className="rounded border-input"
                          />
                          <span>{f.label || f.name}</span>
                        </label>
                      );
                    })}
                    <p className="text-[10px] text-muted-foreground mt-2">מקסימום 12 עמודות מוצגות</p>
                  </div>
                )}
              </div>

              {/* Fields */}
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
                    {/* Row 1: Label, Name, Type, Actions */}
                    <div className="flex gap-3">
                      <div className="flex-[2] min-w-0 space-y-1">
                        <Label className="text-xs text-muted-foreground">שם תצוגה</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(idx, { label: e.target.value })}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1 overflow-hidden">
                        <Label className="text-[10px] text-muted-foreground truncate block">שם במערכת (אנגלית)</Label>
                        <Input
                          value={field.name}
                          onChange={(e) => updateField(idx, { name: e.target.value })}
                          className="h-9 bg-white font-mono text-[11px] truncate"
                        />
                      </div>
                      <div className="w-[160px] space-y-1">
                        <Label className="text-xs text-muted-foreground">סוג שדה</Label>
                        <Select
                          value={field.type}
                          onValueChange={(val) => updateField(idx, { type: val })}
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((ft) => (
                              <SelectItem key={ft.value} value={ft.value}>
                                {ft.label}
                              </SelectItem>
                            ))}
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
                            disabled={idx === (currentSchema.fields?.length || 0) - 1}
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

                    {/* Tab assignment (when tabs exist) */}
                    {tabs.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">טאב:</Label>
                        <select
                          value={field.tab || ""}
                          onChange={(e) => updateField(idx, { tab: e.target.value || undefined })}
                          className="px-2 py-1 border border-input bg-background rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">ללא טאב</option>
                          {tabs.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Conditional editors per type */}

                    {/* Select-like: options editor */}
                    {SELECT_LIKE_TYPES.has(field.type) && (
                      <div className="space-y-1 bg-blue-50/50 p-3 rounded-md border border-blue-100">
                        <Label className="text-xs text-blue-700 font-medium">
                          אפשרויות בחירה (מופרדות בפסיקים)
                        </Label>
                        <Textarea
                          value={Array.isArray(field.options) ? field.options.join(", ") : ""}
                          onChange={(e) => {
                            const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                            updateField(idx, { options: opts });
                          }}
                          placeholder="אפשרות 1, אפשרות 2, אפשרות 3..."
                          className="bg-white min-h-[60px] text-sm"
                        />
                        {field.optionColors && Object.keys(field.optionColors).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(field.optionColors).map(([opt, color]) => (
                              <span
                                key={opt}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                                style={{ borderColor: color, color }}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Score: min/max */}
                    {field.type === "score" && (
                      <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-md border border-amber-100">
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-700 font-medium">מינימום</Label>
                          <Input
                            type="number"
                            value={field.min ?? 0}
                            onChange={(e) => updateField(idx, { min: Number(e.target.value) || 0 })}
                            className="h-8 bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-700 font-medium">מקסימום</Label>
                          <Input
                            type="number"
                            value={field.max ?? 10}
                            onChange={(e) => updateField(idx, { max: Number(e.target.value) || 10 })}
                            className="h-8 bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* Relation: table selector + display field + allowMultiple */}
                    {field.type === "relation" && (
                      <div className="space-y-3 bg-purple-50/50 p-3 rounded-md border border-purple-100">
                        <div className="space-y-1">
                          <Label className="text-xs text-purple-700 font-medium">טבלה מקושרת</Label>
                          <select
                            value={field.relationTableId || ""}
                            onChange={(e) =>
                              updateField(idx, {
                                relationTableId: e.target.value ? Number(e.target.value) : undefined,
                                displayField: undefined,
                              })
                            }
                            className="w-full px-2 py-1.5 border border-input bg-white rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">בחר טבלה...</option>
                            {availableTables.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        {field.relationTableId && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-purple-700 font-medium">שדה לתצוגה</Label>
                              <select
                                value={field.displayField || ""}
                                onChange={(e) => updateField(idx, { displayField: e.target.value || undefined })}
                                className="w-full px-2 py-1.5 border border-input bg-white rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="">ברירת מחדל (שדה ראשון)</option>
                                {getRelatedTableSchema(field.relationTableId).map((f: any) => (
                                  <option key={f.name} value={f.name}>{f.label || f.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center pt-5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={field.allowMultiple || false}
                                  onCheckedChange={(checked) => updateField(idx, { allowMultiple: checked })}
                                />
                                <span className="text-xs font-medium">בחירה מרובה</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lookup: relation field + lookup field */}
                    {field.type === "lookup" && (
                      <div className="grid grid-cols-2 gap-3 bg-green-50/50 p-3 rounded-md border border-green-100">
                        <div className="space-y-1">
                          <Label className="text-xs text-green-700 font-medium">שדה מקושר (Relation)</Label>
                          <select
                            value={field.relationField || ""}
                            onChange={(e) =>
                              updateField(idx, { relationField: e.target.value || undefined, lookupField: undefined })
                            }
                            className="w-full px-2 py-1.5 border border-input bg-white rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">בחר שדה מקושר...</option>
                            {currentSchema.fields
                              .filter((f) => f.type === "relation" && f.name)
                              .map((f) => (
                                <option key={f.name} value={f.name}>{f.label || f.name}</option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-green-700 font-medium">שדה יעד</Label>
                          <select
                            value={field.lookupField || ""}
                            onChange={(e) => updateField(idx, { lookupField: e.target.value || undefined })}
                            className="w-full px-2 py-1.5 border border-input bg-white rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">בחר שדה יעד...</option>
                            {(() => {
                              const relField = currentSchema.fields.find((f) => f.name === field.relationField);
                              if (!relField?.relationTableId) return null;
                              return getRelatedTableSchema(relField.relationTableId).map((f: any) => (
                                <option key={f.name} value={f.name}>{f.label || f.name}</option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-5 pb-4 px-5 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentSchema(null)}
                className="flex-1 h-10"
              >
                ביטול
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="flex-[2] h-10 gap-2"
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
