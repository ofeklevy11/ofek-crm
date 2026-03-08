"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, ArrowUp, ArrowDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { showAlert } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import {
  SelectOptionsEditor,
  SelectOption,
  parseOptionsString,
  optionsToString,
  optionsToSchemaFormat,
  parseOptionsWithColors,
} from "@/components/ui/SelectOptionsEditor";
import type { TabDefinition, TabsConfig } from "@/lib/types/table-tabs";
import { generateTabId, MAX_TABS, parseTabsConfig } from "@/lib/types/table-tabs";

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-");
}

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options: string;
  selectOptions?: Array<{ value: string; color?: string }>;
  relationTableId?: string;
  relationField?: string;
  lookupField?: string;
  defaultValue?: string;
  allowMultiple?: boolean;
  displayField?: string;
  min?: string;
  max?: string;
  tab?: string;
}

interface TableOption {
  id: number;
  name: string;
  schemaJson: any;
}

interface EditTableModalProps {
  tableId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditTableModal({
  tableId,
  isOpen,
  onClose,
}: EditTableModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [tableName, setTableName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tabsEnabled, setTabsEnabled] = useState(false);
  const [tabs, setTabs] = useState<TabDefinition[]>([]);

  useEffect(() => {
    fetch("/api/tables")
      .then((res) => {
        if (res.status === 429) { toast.error(RATE_LIMIT_MESSAGE); return null; }
        if (!res.ok) throw new Error("Failed to load tables");
        return res.json();
      })
      .then((json) => { if (json) setAvailableTables(json.data ?? json); })
      .catch((err) => { console.error("Failed to load tables", err); toast.error(getUserFriendlyError(err)); });

    fetch("/api/categories")
      .then((res) => {
        if (res.status === 429) { toast.error(RATE_LIMIT_MESSAGE); return null; }
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      })
      .then((data) => { if (data) setCategories(data); })
      .catch((err) => { console.error("Failed to load categories", err); toast.error(getUserFriendlyError(err)); });

    fetch("/api/users")
      .then((res) => {
        if (res.status === 429) { toast.error(RATE_LIMIT_MESSAGE); return null; }
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      })
      .then((data) => { if (data) setUsers(data); })
      .catch((err) => { console.error("Failed to load users", err); toast.error(getUserFriendlyError(err)); });
  }, []);

  const handleAddTab = () => {
    if (tabs.length >= MAX_TABS) return;
    setTabs([
      ...tabs,
      { id: generateTabId(), label: `טאב ${tabs.length + 1}`, order: tabs.length },
    ]);
  };

  const handleRemoveTab = (tabId: string) => {
    const remaining = tabs.filter((t) => t.id !== tabId);
    if (remaining.length > 0) {
      setFields((prev) =>
        prev.map((f) =>
          f.tab === tabId ? { ...f, tab: remaining[0].id } : f,
        ),
      );
    } else {
      setFields((prev) => prev.map((f) => ({ ...f, tab: undefined })));
      setTabsEnabled(false);
    }
    setTabs(remaining.map((t, i) => ({ ...t, order: i })));
  };

  useEffect(() => {
    if (isOpen && tableId) {
      loadTableData();
    }
  }, [isOpen, tableId]);

  const loadTableData = async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`/api/tables/${tableId}`);
      if (res.status === 429) { toast.error(RATE_LIMIT_MESSAGE); return; }
      if (!res.ok) throw new Error("Failed to fetch table");

      const table = await res.json();
      setTableName(table.name);
      setSlug(sanitizeSlug(table.slug));
      setCategoryId(table.categoryId || null);

      // Parse schema
      let schema: any[] = [];
      if (Array.isArray(table.schemaJson)) {
        schema = table.schemaJson;
      } else if (typeof table.schemaJson === "string") {
        try { schema = JSON.parse(table.schemaJson); } catch { schema = []; }
      }
      if (!Array.isArray(schema)) schema = [];
      const parsedFields = schema.map((field) => ({
        name: field.name,
        type: field.type,
        label: field.label,
        options: Array.isArray(field.options) ? field.options.join(", ") : "",
        selectOptions: parseOptionsWithColors(
          field.options,
          field.optionColors,
        ),
        relationTableId: field.relationTableId
          ? String(field.relationTableId)
          : undefined,
        relationField: field.relationField,
        lookupField: field.lookupField,
        defaultValue: field.defaultValue,
        allowMultiple: field.allowMultiple,
        displayField: field.displayField,
        min: field.min ? String(field.min) : undefined,
        max: field.max ? String(field.max) : undefined,
        tab: field.tab || undefined,
      }));
      setFields(parsedFields);

      // Parse tabs config
      const parsedTabsConfig = parseTabsConfig(table.tabsConfig);
      if (parsedTabsConfig) {
        setTabsEnabled(parsedTabsConfig.enabled);
        setTabs(parsedTabsConfig.tabs);
      } else {
        setTabsEnabled(false);
        setTabs([]);
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddField = () => {
    setFields([
      ...fields,
      { name: "", type: "text", label: "", options: "", defaultValue: "" },
    ]);
  };

  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleMoveField = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === fields.length - 1) return;

    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];

    setFields(newFields);
  };

  const handleFieldChange = (
    index: number,
    key: keyof FieldRow,
    value: string | boolean,
  ) => {
    const newFields = [...fields];
    (newFields[index][key] as any) = value;

    if (
      key === "label" &&
      newFields[index].name === "" &&
      typeof value === "string"
    ) {
      if (/^[a-zA-Z0-9 ]+$/.test(value)) {
        newFields[index].name = value.toLowerCase().replace(/[^a-z0-9]/g, "_");
      }
    }

    // Auto-populate options for record_owner
    if (key === "type" && value === "record_owner") {
      newFields[index].options = users.map((u) => u.name).join(", ");
      newFields[index].defaultValue = "";
    }

    setFields(newFields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate duplicate field names
    const names = fields.map((f) => f.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      showAlert("שמות שדות מערכת חייבים להיות ייחודיים.");
      setLoading(false);
      return;
    }

    try {
      const schemaJson = fields.map((f) => {
        const isSelectType = [
          "select",
          "multi-select",
          "radio",
          "tags",
          "record_owner",
        ].includes(f.type);

        let options: string[] | undefined = undefined;
        let optionColors: Record<string, string> | undefined = undefined;

        if (isSelectType) {
          if (f.selectOptions && f.selectOptions.length > 0) {
            // New format with colors
            const schemaFormat = optionsToSchemaFormat(f.selectOptions);
            options = schemaFormat.options;
            optionColors =
              Object.keys(schemaFormat.optionColors).length > 0
                ? schemaFormat.optionColors
                : undefined;
          } else if (f.options) {
            // Legacy format - comma separated string
            options = f.options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean);
          }
        }

        return {
          name: f.name,
          type: f.type === "record_owner" ? "select" : f.type,
          label: f.label,
          options,
          optionColors,
          relationTableId: f.relationTableId
            ? Number(f.relationTableId)
            : undefined,
          relationField: f.relationField,
          lookupField: f.lookupField,
          defaultValue: f.defaultValue,
          allowMultiple: f.allowMultiple,
          displayField: f.displayField,
          min: f.type === "score" ? Number(f.min) || 0 : undefined,
          max: f.type === "score" ? Number(f.max) || 10 : undefined,
          tab: f.tab || undefined,
        };
      });

      const tabsConfigPayload: TabsConfig | undefined =
        tabsEnabled && tabs.length > 0
          ? { enabled: true, tabs }
          : undefined;

      const res = await apiFetch(`/api/tables/${tableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          slug: slug,
          schemaJson,
          categoryId,
          tabsConfig: tabsConfigPayload,
        }),
      });

      if (!res.ok) throw new Error("Failed to update table");

      toast.success("הטבלה עודכנה בהצלחה");
      router.refresh();
      onClose();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="!max-w-[95vw] w-full h-[90vh] overflow-y-auto"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">ערוך טבלה</DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="p-8 text-center text-muted-foreground">טוען...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">שם הטבלה</Label>
                <Input
                  type="text"
                  required
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="לדוגמה: פרויקטים"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">מזהה (Slug)</Label>
                <Input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(sanitizeSlug(e.target.value))}
                  className="font-mono ltr text-right"
                  placeholder="e.g. projects"
                />
              </div>

              <div className="col-span-full space-y-2">
                <Label className="text-sm font-bold">קטגוריה</Label>
                <select
                  value={categoryId || ""}
                  onChange={(e) =>
                    setCategoryId(
                      e.target.value ? Number(e.target.value) : null,
                    )
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

            {/* Tab Layout Toggle */}
            <div className="border border-primary/20 bg-primary/5 rounded-xl p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">טאבים</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    ארגן שדות בטאבים לניווט נוח בטפסים
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !tabsEnabled;
                  setTabsEnabled(next);
                  if (next && tabs.length === 0) {
                    setTabs([{ id: generateTabId(), label: "כללי", order: 0 }]);
                  }
                }}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-colors border mt-3 mb-4",
                  tabsEnabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                )}
              >
                {tabsEnabled ? "בטל טאבים" : "הפעל טאבים"}
              </button>

              {tabsEnabled && tabs.length > 0 && (
                <div className="space-y-3">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg border"
                    >
                      <Input
                        value={tab.label}
                        onChange={(e) =>
                          setTabs(
                            tabs.map((t) =>
                              t.id === tab.id ? { ...t, label: e.target.value } : t,
                            ),
                          )
                        }
                        className="h-8 flex-1"
                        placeholder="שם הטאב"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveTab(tab.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTab}
                    disabled={tabs.length >= MAX_TABS}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    הוסף טאב
                  </Button>
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">שדות</h3>
                <Button
                  type="button"
                  onClick={handleAddField}
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> הוסף שדה
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-4 p-4 bg-muted/30 rounded-lg border border-border"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase tracking-wide">
                          תווית (Label)
                        </Label>
                        <Input
                          type="text"
                          required
                          value={field.label}
                          onChange={(e) =>
                            handleFieldChange(index, "label", e.target.value)
                          }
                          placeholder="שם השדה"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase tracking-wide">
                          שם מערכת (Name)
                        </Label>
                        <Input
                          type="text"
                          required
                          value={field.name}
                          onChange={(e) =>
                            handleFieldChange(index, "name", e.target.value)
                          }
                          className="font-mono text-sm"
                          placeholder="field_name"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase tracking-wide">
                          סוג
                        </Label>
                        <select
                          value={field.type}
                          onChange={(e) =>
                            handleFieldChange(index, "type", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="text">טקסט</option>
                          <option value="textarea">טקסט ארוך</option>
                          <option value="number">מספר</option>
                          <option value="date">תאריך</option>
                          <option value="boolean">כן/לא</option>
                          <option value="url">קישור (URL)</option>
                          <option value="record_owner">
                            אחראי רשומה (Record Owner)
                          </option>
                          <option value="select">בחירה (Select)</option>
                          <option value="multi-select">בחירה מרובה</option>
                          <option value="tags">תגיות</option>
                          <option value="radio">כפתורי רדיו</option>
                          <option value="relation">קשר (Relation)</option>
                          <option value="lookup">חיפוש (Lookup)</option>
                          <option value="automation">טריגר אוטומציה</option>
                          <option value="score">ניקוד (מדידה)</option>
                          <option value="phone">טלפון</option>
                        </select>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex bg-muted rounded-md border border-input p-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveField(index, "up")}
                            disabled={index === 0}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
                            title="הזז למעלה"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveField(index, "down")}
                            disabled={index === fields.length - 1}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
                            title="הזז למטה"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRemoveField(index)}
                          className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 h-10"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> הסר
                        </Button>
                      </div>
                    </div>

                    {/* Tab assignment dropdown */}
                    {tabsEnabled && tabs.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <Label className="text-xs font-bold uppercase tracking-wide mb-1 block">
                          שיוך לטאב
                        </Label>
                        <select
                          value={field.tab || ""}
                          onChange={(e) =>
                            handleFieldChange(index, "tab", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">ללא טאב</option>
                          {tabs.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase tracking-wide">
                          ערך ברירת מחדל
                        </Label>
                        <Input
                          type="text"
                          value={field.defaultValue || ""}
                          onChange={(e) =>
                            handleFieldChange(
                              index,
                              "defaultValue",
                              e.target.value,
                            )
                          }
                          placeholder="אופציונלי"
                        />
                      </div>

                      {field.type === "score" && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-wide">
                              ערך מינימום
                            </Label>
                            <Input
                              type="number"
                              value={field.min || ""}
                              onChange={(e) =>
                                handleFieldChange(index, "min", e.target.value)
                              }
                              placeholder="1"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-wide">
                              ערך מקסימום
                            </Label>
                            <Input
                              type="number"
                              value={field.max || ""}
                              onChange={(e) =>
                                handleFieldChange(index, "max", e.target.value)
                              }
                              placeholder="10"
                            />
                          </div>
                        </div>
                      )}

                      {[
                        "select",
                        "multi-select",
                        "radio",
                        "tags",
                        "record_owner",
                      ].includes(field.type) && (
                        <div className="col-span-full space-y-2 pt-3 border-t border-border/50">
                          <Label className="text-xs font-bold uppercase tracking-wide">
                            אפשרויות בחירה (עם צבעים)
                          </Label>
                          <SelectOptionsEditor
                            options={
                              field.selectOptions ||
                              parseOptionsString(field.options)
                            }
                            onChange={(newOptions) => {
                              const newFields = [...fields];
                              newFields[index] = {
                                ...newFields[index],
                                selectOptions: newOptions,
                                options: optionsToString(newOptions),
                              };
                              setFields(newFields);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {field.type === "relation" && (
                      <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold uppercase tracking-wide">
                            טבלה מקושרת
                          </Label>
                          <select
                            value={field.relationTableId || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "relationTableId",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">בחר טבלה...</option>
                            {availableTables.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {field.relationTableId && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wide">
                                שדה לתצוגה
                              </Label>
                              <select
                                value={field.displayField || ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    index,
                                    "displayField",
                                    e.target.value,
                                  )
                                }
                                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">ברירת מחדל (שדה ראשון)</option>
                                {(() => {
                                  const relatedTable = availableTables.find(
                                    (t) =>
                                      t.id === Number(field.relationTableId),
                                  );
                                  if (!relatedTable?.schemaJson) return null;

                                  let relatedSchema: any[] = [];
                                  try {
                                    relatedSchema =
                                      typeof relatedTable.schemaJson ===
                                      "string"
                                        ? JSON.parse(relatedTable.schemaJson)
                                        : relatedTable.schemaJson;
                                  } catch (e) {
                                    return null;
                                  }

                                  return relatedSchema.map((f: any) => (
                                    <option key={f.name} value={f.name}>
                                      {f.label || f.name}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>

                            <div className="flex items-center pt-6">
                              <Label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={field.allowMultiple || false}
                                  onCheckedChange={(checked) =>
                                    handleFieldChange(
                                      index,
                                      "allowMultiple",
                                      checked,
                                    )
                                  }
                                />
                                <span className="text-sm font-medium">
                                  בחירה מרובה
                                </span>
                              </Label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {field.type === "lookup" && (
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold uppercase tracking-wide">
                            שדה מקושר (Relation)
                          </Label>
                          <select
                            value={field.relationField || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "relationField",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">בחר שדה מקושר...</option>
                            {fields
                              .filter((f) => f.type === "relation" && f.name)
                              .map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label || f.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold uppercase tracking-wide">
                            שדה יעד (Target)
                          </Label>
                          <select
                            value={field.lookupField || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                "lookupField",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">בחר שדה יעד...</option>
                            {(() => {
                              const relationField = fields.find(
                                (f) => f.name === field.relationField,
                              );
                              if (!relationField?.relationTableId) return null;
                              const relatedTable = availableTables.find(
                                (t) =>
                                  t.id ===
                                  Number(relationField.relationTableId),
                              );
                              if (!relatedTable?.schemaJson) return null;

                              let relatedSchema: any[] = [];
                              try {
                                relatedSchema =
                                  typeof relatedTable.schemaJson === "string"
                                    ? JSON.parse(relatedTable.schemaJson)
                                    : relatedTable.schemaJson;
                              } catch (e) {
                                return null;
                              }

                              return relatedSchema.map((f: any) => (
                                <option key={f.name} value={f.name}>
                                  {f.label || f.name}
                                </option>
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

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                ביטול
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "מעדכן..." : "עדכן טבלה"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
