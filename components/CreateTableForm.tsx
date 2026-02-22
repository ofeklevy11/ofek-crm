"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  ArrowRight,
  Save,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { showAlert } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import {
  SelectOptionsEditor,
  SelectOption,
  parseOptionsString,
  optionsToString,
  optionsToSchemaFormat,
} from "@/components/ui/SelectOptionsEditor";
import type { TabDefinition, TabsConfig } from "@/lib/types/table-tabs";
import { generateTabId, MAX_TABS } from "@/lib/types/table-tabs";

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options: string; // Comma separated for UI (legacy)
  selectOptions?: Array<{ value: string; color?: string }>; // New format with colors
  relationTableId?: string; // For relation
  relationField?: string; // For lookup (which relation field to use)
  lookupField?: string; // For lookup (which field from related table to show)
  defaultValue?: string;
  allowMultiple?: boolean; // For relation (many-to-many)
  displayField?: string; // For relation (which field to show in picker)
  min?: string; // For score
  max?: string; // For score
  tab?: string; // Tab assignment
}

interface TableOption {
  id: number;
  name: string;
  schemaJson: any;
}

export default function CreateTableForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [slug, setSlug] = useState("");
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  // Tab layout state
  const [tabsEnabled, setTabsEnabled] = useState(false);
  const [tabs, setTabs] = useState<TabDefinition[]>([]);

  const handleAddTab = () => {
    if (tabs.length >= MAX_TABS) return;
    setTabs([
      ...tabs,
      { id: generateTabId(), label: `טאב ${tabs.length + 1}`, order: tabs.length },
    ]);
  };

  const handleRemoveTab = (tabId: string) => {
    const remaining = tabs.filter((t) => t.id !== tabId);
    // Reassign orphaned fields to first remaining tab
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
    const loadData = async () => {
      const { getTables, getCategories, getUsers } =
        await import("@/app/actions");

      const tablesResult = await getTables();
      if (tablesResult.success) {
        setAvailableTables(tablesResult.data!);
      }

      const categoriesResult = await getCategories();
      if (categoriesResult.success) {
        setCategories(categoriesResult.data!);
      }

      const usersResult = await getUsers();
      if (usersResult.success) {
        setUsers(usersResult.data!);
      }
    };
    loadData();
  }, []);

  const [fields, setFields] = useState<FieldRow[]>([
    { name: "title", type: "text", label: "כותרת", options: "" },
    {
      name: "status",
      type: "select",
      label: "סטטוס",
      options: "חדש, בטיפול, סגור",
    },
  ]);

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

    // Auto-generate name from label if name is empty
    if (
      key === "label" &&
      newFields[index].name === "" &&
      typeof value === "string"
    ) {
      // Very basic Hebrew to English slugify or just random?
      // Actually better to leave empty for Hebrew to let user type English system name if possible
      // But if they type English label, it works.
      // We'll try to slugify only if it looks latin.
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
      // Construct schema from fields
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
            options = Array.from(
              new Set(
                f.options
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean),
              ),
            );
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

      // Build tabsConfig if tabs are configured
      const tabsConfigPayload: TabsConfig | undefined =
        tabsEnabled && tabs.length > 0
          ? { enabled: true, tabs }
          : undefined;

      const { createTable } = await import("@/app/actions");
      const result = await createTable({
        name: tableName,
        slug: slug,
        schemaJson: schemaJson as any,
        categoryId: categoryId ?? undefined,
        tabsConfig: tabsConfigPayload as any,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to create table");
      }

      toast.success("הטבלה נוצרה בהצלחה");
      router.push("/tables");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 bg-card p-10 rounded-2xl shadow-sm border border-border text-foreground"
      dir="rtl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <Label className="text-base font-bold">שם הטבלה</Label>
          <Input
            type="text"
            required
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="h-12 text-lg"
            placeholder="לדוגמה: פרויקטים"
          />
          <p className="text-xs text-muted-foreground">
            השם שיוצג עבור הטבלה שלך
          </p>
        </div>

        <div className="space-y-3">
          <Label className="text-base font-bold">מזהה (Slug)</Label>
          <Input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-12 text-lg font-mono ltr text-right"
            placeholder="e.g. projects"
          />
          <p className="text-xs text-muted-foreground">
            מזהה לשימוש ב-URL (באנגלית, ללא רווחים)
          </p>
        </div>

        <div className="col-span-full space-y-3">
          <Label className="text-base font-bold">קטגוריה</Label>
          <select
            value={categoryId || ""}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full px-4 py-3 border border-input bg-background rounded-lg focus:ring-2 focus:ring-ring focus:border-input outline-none transition text-base"
          >
            <option value="">ללא קטגוריה</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            שייך את הטבלה לקטגוריה לסידור נוח
          </p>
        </div>
      </div>

      {/* Tab Layout Toggle */}
      <div className="mt-2">
        <div className="border border-primary/20 bg-primary/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold">טאבים</h3>
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
                "px-4 py-2 rounded-lg text-sm font-bold transition-colors border",
                tabsEnabled
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
              )}
            >
              {tabsEnabled ? "בטל טאבים" : "הפעל טאבים"}
            </button>
          </div>

        {tabsEnabled && tabs.length > 0 && (
          <div className="space-y-3 mb-6">
            {tabs.map((tab, index) => (
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
      </div>

      <div className="border-t border-border pt-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold">שדות</h3>
            <p className="text-sm text-muted-foreground mt-1">
              הגדר את מבנה הנתונים של הטבלה
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAddField}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            הוסף שדה
          </Button>
        </div>

        <div className="space-y-5">
          {fields.map((field, index) => (
            <div
              key={index}
              className="p-6 bg-muted/20 rounded-xl border border-border hover:border-primary/20 transition shadow-sm"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="lg:col-span-1 space-y-2">
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
                    placeholder="שם השדה לתצוגה"
                  />
                </div>
                <div className="lg:col-span-1 space-y-2">
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
                <div className="lg:col-span-1 space-y-2">
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
                <div className="lg:col-span-1 flex items-end gap-2">
                  <div className="flex bg-muted rounded-md border border-input p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveField(index, "up")}
                      disabled={index === 0}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
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
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background rounded-sm"
                      title="הזז למטה"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveField(index)}
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 gap-2 h-10"
                  >
                    <Trash2 className="h-4 w-4" />
                    הסר
                  </Button>
                </div>
              </div>

              {/* Tab assignment dropdown */}
              {tabsEnabled && tabs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <Label className="text-xs font-bold uppercase tracking-wide mb-2 block">
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

              <div className="mt-4 pt-4 border-t border-border/50">
                <Label className="text-xs font-bold uppercase tracking-wide mb-2 block">
                  ערך ברירת מחדל
                </Label>
                <Input
                  type="text"
                  value={field.defaultValue || ""}
                  onChange={(e) =>
                    handleFieldChange(index, "defaultValue", e.target.value)
                  }
                  placeholder="אופציונלי"
                />
              </div>

              {field.type === "score" && (
                <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                <div className="mt-4 pt-4 border-t border-border/50">
                  <Label className="text-xs font-bold uppercase tracking-wide mb-3 block">
                    אפשרויות בחירה (עם צבעים)
                  </Label>
                  <SelectOptionsEditor
                    options={
                      field.selectOptions || parseOptionsString(field.options)
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

              {field.type === "relation" && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
                  <div className="space-y-2">
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
                      <div className="space-y-2">
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
                              (t) => t.id === Number(field.relationTableId),
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
                        <p className="text-xs text-muted-foreground mt-1">
                          איזה שדה להציג בבחירה
                        </p>
                      </div>

                      <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={field.allowMultiple || false}
                            onCheckedChange={(checked) =>
                              handleFieldChange(index, "allowMultiple", checked)
                            }
                          />
                          <span className="text-sm font-medium">
                            אפשר בחירה מרובה
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {field.type === "lookup" && (
                <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wide">
                      שדה מקושר (Relation Field)
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
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wide">
                      שדה יעד (Target Field)
                    </Label>
                    <select
                      value={field.lookupField || ""}
                      onChange={(e) =>
                        handleFieldChange(index, "lookupField", e.target.value)
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
                          (t) => t.id === Number(relationField.relationTableId),
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

        {fields.length === 0 && (
          <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed border-border">
            <p className="text-muted-foreground mb-4">לא נוספו שדות עדיין</p>
            <Button
              type="button"
              onClick={handleAddField}
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              הוסף את השדה הראשון שלך
            </Button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4 pt-6 border-t border-border">
        <Button
          type="button"
          onClick={() => window.history.back()}
          variant="outline"
          className="h-12 px-8"
        >
          ביטול
        </Button>
        <Button type="submit" disabled={loading} className="h-12 px-8 gap-2">
          {loading ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-background border-t-transparent rounded-full font-bold inline-block mr-2" />
              יוצר טבלה...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              צור טבלה
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
