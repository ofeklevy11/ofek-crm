"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Trash2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type FlowStep,
  type FieldConfig,
  TRIGGER_LABELS,
  ACTION_LABELS,
  TRIGGER_ICONS,
  ACTION_ICONS,
  TRIGGER_COLORS,
  ACTION_COLORS,
  TRIGGER_FIELD_CONFIGS,
  ACTION_FIELD_CONFIGS,
  SELECTABLE_TRIGGER_TYPES,
  SELECTABLE_ACTION_TYPES,
  getNestedValue,
} from "./field-configs";

function formatPhonePreview(phone: string, type: "private" | "group") {
  if (!phone) return "";
  let clean = phone.trim();
  if (type === "group") {
    if (!clean.endsWith("@g.us")) return clean + "@g.us";
    return clean;
  }
  clean = clean.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.substring(1);
  if (!clean.endsWith("@c.us")) clean = clean + "@c.us";
  return clean;
}

interface FlowStepCardProps {
  step: FlowStep;
  stepIndex: number;
  tables: { id: number; name: string; schemaJson: any }[];
  users: { id: number; name: string }[];
  onFieldChange: (stepId: string, fieldKey: string, value: any) => void;
  onTypeChange?: (stepId: string, newType: string) => void;
  onRemove?: (stepId: string) => void;
  canRemove?: boolean;
  triggerTableId?: number;
}

export default function FlowStepCard({
  step,
  stepIndex,
  tables,
  users,
  onFieldChange,
  onTypeChange,
  onRemove,
  canRemove,
  triggerTableId,
}: FlowStepCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const isTrigger = step.kind === "trigger";
  const labels = isTrigger ? TRIGGER_LABELS : ACTION_LABELS;
  const icons = isTrigger ? TRIGGER_ICONS : ACTION_ICONS;
  const colors = isTrigger ? TRIGGER_COLORS : ACTION_COLORS;
  const fieldConfigs = isTrigger ? TRIGGER_FIELD_CONFIGS : ACTION_FIELD_CONFIGS;
  const selectableTypes = isTrigger ? SELECTABLE_TRIGGER_TYPES : SELECTABLE_ACTION_TYPES;

  const Icon = icons[step.type];
  const borderColor = colors[step.type] || (isTrigger ? "border-blue-400" : "border-green-400");
  const typeLabel = labels[step.type] || step.type;
  const fields = fieldConfigs[step.type] || [];

  // Find the tableId for column-select fields (fall back to trigger's tableId)
  const resolveTableId = (): number | undefined => {
    if (step.config.tableId) return Number(step.config.tableId);
    if (triggerTableId) return triggerTableId;
    return undefined;
  };

  const getColumnOptions = (columnIdKey = "columnId"): { value: string; label: string }[] => {
    const tableId = resolveTableId();
    if (!tableId) return [];
    const table = tables.find((t) => t.id === tableId);
    if (!table || !Array.isArray(table.schemaJson)) return [];
    const columnId = step.config[columnIdKey];
    if (!columnId) return [];
    const column = table.schemaJson.find(
      (col: any) => (col.name || col.id) === columnId
    );
    if (!column || !Array.isArray(column.options)) return [];
    return column.options.map((opt: any) =>
      typeof opt === "string"
        ? { value: opt, label: opt }
        : { value: opt.value ?? opt.id ?? "", label: opt.label ?? opt.value ?? opt.id ?? "" }
    );
  };

  const TRIGGER_COLUMN_TYPES = new Set([
    "select", "multiSelect", "status", "priority",
    "number", "currency",
    "boolean", "checkbox",
    "date",
  ]);

  const getColumnsForTable = (tableId: number | undefined, filterForTrigger = false) => {
    if (!tableId) return [];
    const table = tables.find((t) => t.id === tableId);
    if (!table || !Array.isArray(table.schemaJson)) return [];
    let cols = table.schemaJson;
    if (filterForTrigger) {
      cols = cols.filter((col: any) => TRIGGER_COLUMN_TYPES.has(col.type));
    }
    return cols.map((col: any) => ({
      value: col.name || col.id || "",
      label: col.label || col.name || col.id || "",
    }));
  };

  const renderField = (field: FieldConfig) => {
    const value = getNestedValue(step.config, field.key);

    switch (field.inputType) {
      case "text":
        return (
          <Input
            value={value ?? ""}
            onChange={(e) => onFieldChange(step.id, field.key, e.target.value)}
            placeholder={field.placeholder}
            className="h-8 text-sm"
            dir="auto"
          />
        );

      case "textarea":
        return (
          <Textarea
            value={value ?? ""}
            onChange={(e) => onFieldChange(step.id, field.key, e.target.value)}
            placeholder={field.placeholder}
            className="text-sm min-h-[60px] resize-none"
            rows={2}
            dir="auto"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value ?? ""}
            onChange={(e) => onFieldChange(step.id, field.key, e.target.value ? Number(e.target.value) : "")}
            placeholder={field.placeholder}
            className="h-8 text-sm"
          />
        );

      case "select":
        return (
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => onFieldChange(step.id, field.key, v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="בחר..." />
            </SelectTrigger>
            <SelectContent position="popper">
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "user-select":
        return (
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => onFieldChange(step.id, field.key, Number(v))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="בחר משתמש..." />
            </SelectTrigger>
            <SelectContent position="popper">
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "table-select":
        return (
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => onFieldChange(step.id, field.key, Number(v))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="בחר טבלה..." />
            </SelectTrigger>
            <SelectContent position="popper">
              {tables.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "column-select": {
        const tableId = resolveTableId();
        const shouldFilterForTrigger = isTrigger && step.type === "RECORD_FIELD_CHANGE";
        const columns = getColumnsForTable(tableId, shouldFilterForTrigger);
        if (columns.length === 0) {
          return (
            <Input
              value={value ?? ""}
              onChange={(e) => onFieldChange(step.id, field.key, e.target.value)}
              placeholder="fld_..."
              className="h-8 text-sm"
              dir="ltr"
            />
          );
        }
        return (
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => onFieldChange(step.id, field.key, v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="בחר עמודה..." />
            </SelectTrigger>
            <SelectContent position="popper">
              {columns.map((col: { value: string; label: string }) => (
                <SelectItem key={col.value} value={col.value}>
                  {col.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "column-value": {
        const colKey = field.columnIdKey || "columnId";
        // Don't render value field until a column is selected
        if (!step.config[colKey]) {
          return <p className="text-xs text-gray-400">יש לבחור עמודה תחילה</p>;
        }
        const columnOpts = getColumnOptions(colKey);
        if (columnOpts.length === 0) {
          return (
            <Input
              value={value ?? ""}
              onChange={(e) => onFieldChange(step.id, field.key, e.target.value)}
              placeholder={field.placeholder}
              className="h-8 text-sm"
              dir="auto"
            />
          );
        }
        return (
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => onFieldChange(step.id, field.key, v === "__empty__" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={field.placeholder || "בחר ערך..."} />
            </SelectTrigger>
            <SelectContent position="popper">
              {field.optional && (
                <SelectItem value="__empty__">כל ערך</SelectItem>
              )}
              {columnOpts.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "whatsapp-phone": {
        const isManual = typeof value === "string" && value.startsWith("manual:");
        const isGroup = isManual && value.includes("@g.us");
        const mode = isGroup ? "group" : isManual ? "manual" : "column";

        const tableId = resolveTableId();
        const columns = getColumnsForTable(tableId);

        const rawPhone = isManual ? (value as string).replace("manual:", "") : "";

        return (
          <div className="space-y-2">
            {/* Mode tabs */}
            <div className="flex gap-1">
              {([
                { key: "column", label: "לפי עמודה" },
                { key: "manual", label: "מספר ידני" },
                { key: "group", label: "קבוצה" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (tab.key === "column") onFieldChange(step.id, field.key, "");
                    else if (tab.key === "manual") onFieldChange(step.id, field.key, "manual:");
                    else onFieldChange(step.id, field.key, "manual:@g.us");
                  }}
                  className={`px-2 py-1 text-xs rounded transition ${
                    mode === tab.key
                      ? "bg-purple-100 text-purple-700 font-medium"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mode-specific input */}
            {mode === "column" && (
              !tableId ? (
                <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded border border-gray-200">
                  באוטומציה זו, לא ניתן לבחור עמודה דינמית כי אין טבלה משויכת לטריגר.
                  נא להשתמש במספר ידני או לשנות סוג אוטומציה.
                </p>
              ) : columns.length > 0 ? (
                <Select
                  value={value != null ? String(value) : ""}
                  onValueChange={(v) => onFieldChange(step.id, field.key, v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="בחר עמודה..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {columns.map((col: { value: string; label: string }) => (
                      <SelectItem key={col.value} value={col.value}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={value ?? ""}
                  onChange={(e) => onFieldChange(step.id, field.key, e.target.value)}
                  placeholder="fld_..."
                  className="h-8 text-sm"
                  dir="ltr"
                />
              )
            )}

            {mode === "manual" && (
              <div className="space-y-1">
                <Input
                  value={rawPhone}
                  onChange={(e) => onFieldChange(step.id, field.key, "manual:" + e.target.value)}
                  placeholder="0501234567"
                  className="h-8 text-sm"
                  dir="ltr"
                />
                {rawPhone && (
                  <p className="text-xs text-gray-400" dir="ltr">
                    {formatPhonePreview(rawPhone, "private")}
                  </p>
                )}
              </div>
            )}

            {mode === "group" && (
              <div className="space-y-1">
                <Input
                  value={rawPhone}
                  onChange={(e) => onFieldChange(step.id, field.key, "manual:" + e.target.value)}
                  placeholder="120363xxxxx@g.us"
                  className="h-8 text-sm"
                  dir="ltr"
                />
                <p className="text-xs text-gray-400">
                  מזהה קבוצה צריך להסתיים ב-@g.us
                </p>
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Split fields into normal vs collapsible groups
  const normalFields = useMemo(() => fields.filter(f => !f.collapsible), [fields]);
  const collapsibleFields = useMemo(() => fields.filter(f => f.collapsible), [fields]);
  const hasCollapsibleValues = collapsibleFields.some(
    f => getNestedValue(step.config, f.key)
  );

  const [conditionOpen, setConditionOpen] = useState(hasCollapsibleValues);

  // For types with no field configs (MULTI_EVENT_DURATION, CALCULATE_MULTI_EVENT_DURATION),
  // show a read-only JSON preview
  const showJsonFallback = fields.length === 0 && Object.keys(step.config).length > 0;

  return (
    <div
      dir="rtl"
      className={`border-r-4 ${borderColor} rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden transition-all`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 text-right ${
          isTrigger ? "bg-blue-50/50" : "bg-green-50/50"
        }`}
      >
        {/* Remove button */}
        {canRemove && onRemove && (
          <button
            onClick={() => onRemove(step.id)}
            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition shrink-0"
            title="הסר פעולה"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-gray-100/50 rounded p-0.5 transition shrink-0"
        >
          <span
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white ${
              isTrigger ? "bg-blue-500" : "bg-green-500"
            }`}
          >
            {stepIndex}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {Icon && <Icon className="w-4 h-4 text-gray-600 shrink-0" />}

        {/* Type label — clickable popover for type change */}
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-gray-400 mr-1">
            {isTrigger ? "טריגר" : "פעולה"}
          </span>
          {onTypeChange ? (
            <Popover open={typePickerOpen} onOpenChange={setTypePickerOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:border-purple-400 hover:bg-purple-50 transition shadow-sm">
                  {typeLabel}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
                <div className="space-y-0.5">
                  {selectableTypes.map((t) => {
                    const TypeIcon = icons[t];
                    const isActive = t === step.type;
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          if (t !== step.type) {
                            onTypeChange(step.id, t);
                          }
                          setTypePickerOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-right transition ${
                          isActive
                            ? "bg-purple-100 text-purple-700 font-medium"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        {TypeIcon && <TypeIcon className="w-4 h-4 shrink-0" />}
                        <span>{labels[t] || t}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-800">
              {typeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-100 space-y-3">
          {normalFields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs text-gray-500">{field.label}</Label>
              {renderField(field)}
            </div>
          ))}

          {/* Collapsible condition fields */}
          {collapsibleFields.length > 0 && (
            <>
              {conditionOpen ? (
                <div className="space-y-3 border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50/50">
                  {collapsibleFields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs text-gray-500">{field.label}</Label>
                      {renderField(field)}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      for (const f of collapsibleFields) {
                        onFieldChange(step.id, f.key, "");
                      }
                      setConditionOpen(false);
                    }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition"
                  >
                    <X className="w-3 h-3" />
                    הסר תנאי
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConditionOpen(true)}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
                >
                  <Plus className="w-3 h-3" />
                  הוסף תנאי
                </button>
              )}
            </>
          )}

          {showJsonFallback && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">
                קונפיגורציה (עריכה דרך AI)
              </Label>
              <pre
                className="text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto max-h-32"
                dir="ltr"
              >
                {JSON.stringify(step.config, null, 2)}
              </pre>
            </div>
          )}

          {fields.length === 0 && !showJsonFallback && (
            step.type === "CALCULATE_DURATION" ? (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 space-y-1">
                <p className="text-sm font-semibold text-teal-800">איך זה עובד?</p>
                <p className="text-xs text-teal-700 leading-relaxed">
                  המערכת תחשב אוטומטית את הזמן שעבר בין השינוי האחרון לשינוי הנוכחי ותשמור אותו בדוח ביצועים. אין צורך בהגדרות נוספות.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">אין שדות לעריכה</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
