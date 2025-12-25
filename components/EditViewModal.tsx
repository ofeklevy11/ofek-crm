"use client";

import { useState } from "react";
import { updateView, ViewConfig } from "@/app/actions/views";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Calendar, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditViewModalProps {
  viewId: number;
  currentConfig: {
    name: string;
    slug: string;
    config: ViewConfig;
    isEnabled: boolean;
  };
  tableSlug: string;
  schema: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
  }>;
  onClose: () => void;
}

export default function EditViewModal({
  viewId,
  currentConfig,
  tableSlug,
  schema,
  onClose,
}: EditViewModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - initialized with current values
  const [name, setName] = useState(currentConfig.name);
  const [viewType, setViewType] = useState<
    "stats" | "aggregation" | "legend" | "chart"
  >(currentConfig.config.type);
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all">(
    currentConfig.config.timeRange || "week"
  );
  const [aggregationType, setAggregationType] = useState<
    "sum" | "count" | "avg" | "group"
  >(currentConfig.config.aggregationType || "count");
  const [targetField, setTargetField] = useState(
    currentConfig.config.targetField || ""
  );
  const [targetFields, setTargetFields] = useState<string[]>(
    currentConfig.config.targetFields || []
  );
  const [groupByField, setGroupByField] = useState(
    currentConfig.config.groupByField || ""
  );

  // Filter state for count aggregation
  const firstFilter = currentConfig.config.filters?.[0];
  const [filterField, setFilterField] = useState(firstFilter?.field || "");
  const [filterValue, setFilterValue] = useState(
    firstFilter?.value ? String(firstFilter.value) : ""
  );

  // Date filter state
  const [useDateFilter, setUseDateFilter] = useState(
    !!currentConfig.config.dateFilter
  );
  const [dateField, setDateField] = useState(
    currentConfig.config.dateFilter?.field || ""
  );
  const [dateFilterType, setDateFilterType] = useState<
    "week" | "month" | "custom" | "all"
  >(currentConfig.config.dateFilter?.type || "all");
  const [startDate, setStartDate] = useState(
    currentConfig.config.dateFilter?.startDate || ""
  );
  const [endDate, setEndDate] = useState(
    currentConfig.config.dateFilter?.endDate || ""
  );

  // Legend color mapping state
  const [legendField, setLegendField] = useState(
    currentConfig.config.legendField || ""
  );
  const [colorMappings, setColorMappings] = useState<
    Record<string, { color: string; description?: string; priority?: number }>
  >(currentConfig.config.colorMappings || {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Build config based on view type
      const config: ViewConfig = {
        type: viewType,
        title: name,
      };

      if (viewType === "stats") {
        config.timeRange = timeRange;
      } else if (viewType === "aggregation") {
        config.aggregationType = aggregationType;
        if (aggregationType === "group") {
          config.groupByField = groupByField;
          if (targetField) config.targetField = targetField;
          if (targetFields.length > 0) config.targetFields = targetFields;
        } else if (aggregationType === "count") {
          // For count, add filter if specified
          if (filterField && filterValue) {
            config.filters = [
              {
                field: filterField,
                operator: "equals",
                value: filterValue,
              },
            ];
          }
        } else {
          // For sum/avg, targetField is required
          config.targetField = targetField;
          if (targetFields.length > 0) config.targetFields = targetFields;
        }
      } else if (currentConfig.config.type === "legend") {
        // Add color mapping configuration
        if (legendField && Object.keys(colorMappings).length > 0) {
          config.legendField = legendField;
          config.colorMappings = colorMappings;
          // Build legend items array for backward compatibility
          config.legendItems = Object.entries(colorMappings).map(
            ([value, mapping]) => ({
              label: value,
              color: mapping.color,
              description: mapping.description,
            })
          );
        }
      }

      // Add date filter if enabled
      if (useDateFilter && dateField) {
        config.dateFilter = {
          field: dateField,
          type: dateFilterType,
          ...(dateFilterType === "custom" && {
            startDate,
            endDate,
          }),
        };
      }

      const result = await updateView(viewId, {
        name,
        config,
      });

      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error || "Failed to update view");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col p-0 gap-0"
        dir="rtl"
      >
        <DialogHeader className="p-6 border-b bg-muted/20 pb-4">
          <DialogTitle className="text-2xl font-bold">עריכת תצוגה</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            ערוך את ההגדרות והחישובים של התצוגה
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* View Name */}
              <div className="space-y-2">
                <Label htmlFor="view-name">
                  שם התצוגה <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="view-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* View Type ReadOnly */}
              <div className="space-y-2">
                <Label>סוג התצוגה</Label>
                <div className="h-10 px-3 flex items-center bg-muted rounded-md text-sm text-muted-foreground border">
                  {viewType === "stats" && "📊 סטטיסטיקות לפי זמן"}
                  {viewType === "aggregation" && "🔢 חישובים ואגרגציות"}
                  {viewType === "legend" && "🎨 מקרא צבעים"}
                  {viewType === "chart" && "📈 גרפים"}
                </div>
              </div>
            </div>

            {/* Dynamic Configuration Fields based on Type */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4 space-y-4">
                {viewType === "stats" && (
                  <div className="space-y-2">
                    <Label>טווח זמן</Label>
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="week">📅 השבוע הנוכחי</option>
                      <option value="month">📆 החודש הנוכחי</option>
                      <option value="all">🗓️ כל הזמנים</option>
                    </select>
                  </div>
                )}

                {viewType === "aggregation" && (
                  <>
                    <div className="space-y-2">
                      <Label>סוג החישוב</Label>
                      <select
                        value={aggregationType}
                        onChange={(e) =>
                          setAggregationType(e.target.value as any)
                        }
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="count">🔢 ספירה</option>
                        <option value="sum">➕ סכום</option>
                        <option value="avg">➗ ממוצע</option>
                        <option value="group">📊 קיבוץ</option>
                      </select>
                    </div>

                    {aggregationType === "group" && (
                      <>
                        <div className="space-y-2">
                          <Label>
                            שדה לקיבוץ{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <select
                            value={groupByField}
                            onChange={(e) => setGroupByField(e.target.value)}
                            required
                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="">בחר שדה...</option>
                            {schema
                              .filter(
                                (f) =>
                                  f.type === "select" ||
                                  f.type === "multi-select"
                              )
                              .map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>שדה לסיכום (אופציונלי)</Label>
                          <select
                            value={targetField}
                            onChange={(e) => setTargetField(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="">ללא</option>
                            {schema
                              .filter((f) => f.type === "number")
                              .map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      </>
                    )}

                    {aggregationType === "count" && (
                      <div className="space-y-3 p-3 bg-background rounded-md border">
                        <div className="space-y-2">
                          <Label>שדה לפילטר (אופציונלי)</Label>
                          <select
                            value={filterField}
                            onChange={(e) => {
                              setFilterField(e.target.value);
                              setFilterValue("");
                            }}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="">ספירה כללית - ללא פילטר</option>
                            {schema.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.label} ({f.type})
                              </option>
                            ))}
                          </select>
                        </div>
                        {filterField && (
                          <div className="space-y-2">
                            <Label>ערך לחיפוש</Label>
                            <Input
                              value={filterValue}
                              onChange={(e) => setFilterValue(e.target.value)}
                              placeholder="הזן ערך..."
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {(aggregationType === "sum" ||
                      aggregationType === "avg") && (
                      <div className="space-y-2">
                        <Label>
                          שדה לחישוב <span className="text-destructive">*</span>
                        </Label>
                        <select
                          value={targetField}
                          onChange={(e) => setTargetField(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                          <option value="">בחר שדה...</option>
                          {schema
                            .filter((f) => f.type === "number")
                            .map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {viewType === "legend" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>
                        שדה לצביעה <span className="text-destructive">*</span>
                      </Label>
                      <select
                        value={legendField}
                        onChange={(e) => {
                          const field = e.target.value;
                          setLegendField(field);
                          // Reset and init logic
                          if (field) {
                            const selectedField = schema.find(
                              (f) => f.name === field
                            );
                            if (selectedField?.options) {
                              const newMappings: any = {};
                              selectedField.options.forEach((opt) => {
                                newMappings[opt] = {
                                  color: colorMappings[opt]?.color || "#e5e7eb",
                                  description:
                                    colorMappings[opt]?.description || "",
                                  priority: colorMappings[opt]?.priority || 0,
                                };
                              });
                              setColorMappings(newMappings);
                            }
                          }
                        }}
                        required
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="">בחר שדה...</option>
                        {schema
                          .filter(
                            (f) =>
                              f.type === "select" || f.type === "multi-select"
                          )
                          .map((f) => (
                            <option key={f.name} value={f.name}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    </div>

                    {legendField && Object.keys(colorMappings).length > 0 && (
                      <div className="space-y-3 mt-4">
                        <Label>הגדרת צבעים</Label>
                        <div className="grid gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {Object.entries(colorMappings).map(
                            ([value, mapping]) => (
                              <div
                                key={value}
                                className="flex items-center gap-3 p-2 bg-background rounded-md border"
                              >
                                <input
                                  type="color"
                                  value={mapping.color}
                                  onChange={(e) =>
                                    setColorMappings((prev) => ({
                                      ...prev,
                                      [value]: {
                                        ...prev[value],
                                        color: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-8 h-8 rounded cursor-pointer border-0"
                                />
                                <div className="flex-1 text-sm font-medium">
                                  {value}
                                </div>
                                <Input
                                  placeholder="תיאור..."
                                  value={mapping.description || ""}
                                  onChange={(e) =>
                                    setColorMappings((prev) => ({
                                      ...prev,
                                      [value]: {
                                        ...prev[value],
                                        description: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-8 text-xs w-[120px]"
                                />
                                <div className="flex flex-col items-center gap-1">
                                  <Label className="text-[10px]">עדיפות</Label>
                                  <Input
                                    type="number"
                                    value={mapping.priority ?? 0}
                                    onChange={(e) =>
                                      setColorMappings((prev) => ({
                                        ...prev,
                                        [value]: {
                                          ...prev[value],
                                          priority:
                                            parseInt(e.target.value) || 0,
                                        },
                                      }))
                                    }
                                    className="h-7 w-14 text-center px-1"
                                  />
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Date Filter Section */}
            <div className="bg-muted/10 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label>פילטר תאריך (אופציונלי)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {useDateFilter ? "פעיל" : "לא פעיל"}
                  </span>
                  <Checkbox
                    checked={useDateFilter}
                    onCheckedChange={(c) => setUseDateFilter(!!c)}
                  />
                </div>
              </div>

              {useDateFilter && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    <Label>
                      שדה תאריך <span className="text-destructive">*</span>
                    </Label>
                    <select
                      value={dateField}
                      onChange={(e) => setDateField(e.target.value)}
                      required={useDateFilter}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">בחר שדה...</option>
                      <option value="createdAt">תאריך יצירה</option>
                      <option value="updatedAt">תאריך עדכון</option>
                      {schema
                        .filter((f) => f.type === "date")
                        .map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.label}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>טווח</Label>
                    <select
                      value={dateFilterType}
                      onChange={(e) => setDateFilterType(e.target.value as any)}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="all">כל הזמנים</option>
                      <option value="week">שבוע אחרון</option>
                      <option value="month">חודש אחרון</option>
                      <option value="custom">מותאם אישית</option>
                    </select>
                  </div>
                  {dateFilterType === "custom" && (
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>מ-</Label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>עד-</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-muted/20 gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSubmitting ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
