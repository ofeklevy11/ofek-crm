"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  RotateCw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  LayoutGrid,
} from "lucide-react";
import type {
  TabDefinition,
  TabsConfig,
  DisplayConfig,
  SchemaFieldWithTab,
} from "@/lib/types/table-tabs";
import {
  generateTabId,
  MAX_TABS,
  MAX_VISIBLE_COLUMNS,
} from "@/lib/types/table-tabs";

interface TableSettingsModalProps {
  tableId: number;
  schema: SchemaFieldWithTab[];
  tabsConfig: TabsConfig | null;
  displayConfig: DisplayConfig | null;
  open: boolean;
  onClose: () => void;
}

export default function TableSettingsModal({
  tableId,
  schema,
  tabsConfig: initialTabsConfig,
  displayConfig: initialDisplayConfig,
  open,
  onClose,
}: TableSettingsModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Tab management state
  const [tabsEnabled, setTabsEnabled] = useState(initialTabsConfig?.enabled ?? false);
  const [tabs, setTabs] = useState<TabDefinition[]>(
    initialTabsConfig?.tabs ?? [],
  );
  // Field-to-tab assignments (fieldName -> tabId)
  const [fieldTabs, setFieldTabs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const field of schema) {
      if (field.tab) map[field.name] = field.tab;
    }
    return map;
  });

  // Column display state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    initialDisplayConfig?.visibleColumns ?? schema.slice(0, MAX_VISIBLE_COLUMNS).map((f) => f.name),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    initialDisplayConfig?.columnOrder ?? schema.map((f) => f.name),
  );

  // Tab CRUD
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
    const newFieldTabs = { ...fieldTabs };
    for (const [fieldName, fTabId] of Object.entries(newFieldTabs)) {
      if (fTabId === tabId) {
        if (remaining.length > 0) {
          newFieldTabs[fieldName] = remaining[0].id;
        } else {
          delete newFieldTabs[fieldName];
        }
      }
    }
    setFieldTabs(newFieldTabs);
    setTabs(remaining.map((t, i) => ({ ...t, order: i })));
  };

  const handleRenameTab = (tabId: string, newLabel: string) => {
    setTabs(tabs.map((t) => (t.id === tabId ? { ...t, label: newLabel } : t)));
  };

  const handleMoveTab = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === tabs.length - 1) return;
    const newTabs = [...tabs];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    [newTabs[index], newTabs[targetIdx]] = [newTabs[targetIdx], newTabs[index]];
    setTabs(newTabs.map((t, i) => ({ ...t, order: i })));
  };

  // Column display
  const handleToggleVisible = (fieldName: string) => {
    if (visibleColumns.includes(fieldName)) {
      setVisibleColumns(visibleColumns.filter((n) => n !== fieldName));
    } else {
      if (visibleColumns.length >= MAX_VISIBLE_COLUMNS) return;
      setVisibleColumns([...visibleColumns, fieldName]);
    }
  };

  const handleMoveColumn = (index: number, direction: "up" | "down") => {
    const ordered = columnOrder.filter((n) => visibleColumns.includes(n));
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === ordered.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const newOrdered = [...ordered];
    [newOrdered[index], newOrdered[targetIdx]] = [newOrdered[targetIdx], newOrdered[index]];
    setColumnOrder(newOrdered);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build updated schemaJson with tab assignments
      const updatedSchema = schema.map((field) => ({
        ...field,
        tab: fieldTabs[field.name] || undefined,
      }));

      const newTabsConfig: TabsConfig | null = tabsEnabled
        ? { enabled: true, tabs }
        : tabs.length > 0
          ? { enabled: false, tabs }
          : null;

      const newDisplayConfig: DisplayConfig | null =
        visibleColumns.length > 0
          ? { visibleColumns, columnOrder }
          : null;

      const { updateTable } = await import("@/app/actions/tables");
      const result = await updateTable(tableId, {
        schemaJson: updatedSchema as any,
        tabsConfig: newTabsConfig as any,
        displayConfig: newDisplayConfig as any,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save settings");
      }

      toast.success("הגדרות נשמרו בהצלחה");
      router.refresh();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const orderedVisibleColumns = columnOrder.filter((n) => visibleColumns.includes(n));
  // Add any visible columns that aren't in columnOrder yet
  for (const vc of visibleColumns) {
    if (!orderedVisibleColumns.includes(vc)) {
      orderedVisibleColumns.push(vc);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-[95vw] w-full max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            הגדרות טבלה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* Tab Management Section */}
          <div className="space-y-4">
            <div className="border border-primary/20 bg-primary/5 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">טאבים</h3>
                  <p className="text-sm text-muted-foreground">
                    ארגן שדות בטאבים לניווט נוח בטפסים
                  </p>
                </div>
              </div>
              {!tabsEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setTabsEnabled(true);
                    if (tabs.length === 0) {
                      setTabs([{ id: generateTabId(), label: "כללי", order: 0 }]);
                    }
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-colors border mt-3",
                    "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  )}
                >
                  הפעל טאבים
                </button>
              )}
            </div>

            {(tabsEnabled || tabs.length > 0) && (
              <div className="space-y-3">
                {tabs.map((tab, index) => (
                  <div
                    key={tab.id}
                    className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg border"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      value={tab.label}
                      onChange={(e) => handleRenameTab(tab.id, e.target.value)}
                      className="h-8 flex-1"
                      placeholder="שם הטאב"
                    />
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {schema.filter((f) => fieldTabs[f.name] === tab.id).length} שדות
                    </Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleMoveTab(index, "up")}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleMoveTab(index, "down")}
                        disabled={index === tabs.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
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

                {/* Field-to-Tab assignment */}
                {tabs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <Label className="text-sm font-bold">שיוך שדות לטאבים</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {schema.map((field) => (
                        <div
                          key={field.name}
                          className="flex items-center gap-2 px-3 py-2 bg-muted/10 rounded border text-sm"
                        >
                          <span className="flex-1 font-medium">
                            {field.label}
                          </span>
                          <select
                            value={fieldTabs[field.name] || ""}
                            onChange={(e) => {
                              const newFieldTabs = { ...fieldTabs };
                              if (e.target.value) {
                                newFieldTabs[field.name] = e.target.value;
                              } else {
                                delete newFieldTabs[field.name];
                              }
                              setFieldTabs(newFieldTabs);
                            }}
                            className="h-7 w-48 rounded border border-input bg-background px-2 text-xs"
                          >
                            <option value="">ללא טאב</option>
                            {tabs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column Display Section */}
          <div className="space-y-4 border-t pt-6">
            <div>
              <h3 className="text-lg font-bold">תצוגת עמודות</h3>
              <p className="text-sm text-muted-foreground">
                בחר אילו עמודות יוצגו בסקירת הטבלה (עד {MAX_VISIBLE_COLUMNS})
              </p>
            </div>

            <div className="space-y-1.5">
              {orderedVisibleColumns.map((fieldName, idx) => {
                const field = schema.find((f) => f.name === fieldName);
                if (!field) return null;
                return (
                  <div
                    key={fieldName}
                    className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded border border-primary/20 text-sm"
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => handleToggleVisible(fieldName)}
                    />
                    <span className="flex-1 font-medium">{field.label}</span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveColumn(idx, "up")}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveColumn(idx, "down")}
                        disabled={idx === orderedVisibleColumns.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hidden columns */}
            {schema.filter((f) => !visibleColumns.includes(f.name)).length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  עמודות מוסתרות
                </p>
                {schema
                  .filter((f) => !visibleColumns.includes(f.name))
                  .map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded border text-sm"
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => handleToggleVisible(field.name)}
                        disabled={visibleColumns.length >= MAX_VISIBLE_COLUMNS}
                      />
                      <span className="flex-1 text-muted-foreground">
                        {field.label}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {visibleColumns.length}/{MAX_VISIBLE_COLUMNS} עמודות מוצגות
              {" | "}
              ייצוא CSV/TXT תמיד כולל את כל העמודות
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                שמור הגדרות
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
