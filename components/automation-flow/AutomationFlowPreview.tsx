"use client";

import { useMemo, useState, useCallback } from "react";
import { MessageSquare, Plus, RotateCcw, Pencil } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import FlowStepCard from "./FlowStepCard";
import FlowConnector from "./FlowConnector";
import {
  type AutomationSchema,
  type FlowStep,
  schemaToSteps,
  stepsToSchema,
  setNestedValue,
  TRIGGER_LABELS,
  ACTION_LABELS,
  ACTION_ICONS,
  TIER_ACTION_LIMITS,
  SELECTABLE_ACTION_TYPES,
  TRIGGER_FIELD_CONFIGS,
  ACTION_FIELD_CONFIGS,
} from "./field-configs";

interface AutomationFlowPreviewProps {
  schema: AutomationSchema;
  onSchemaChange: (schema: AutomationSchema) => void;
  tables: { id: number; name: string; schemaJson: any }[];
  users: { id: number; name: string }[];
  onChatFocus: () => void;
  creating: boolean;
  onReset: () => void;
  onEdit: () => void;
  onCreate: () => void;
  userPlan?: string;
}

export default function AutomationFlowPreview({
  schema,
  onSchemaChange,
  tables,
  users,
  onChatFocus,
  creating,
  onReset,
  onEdit,
  onCreate,
  userPlan,
}: AutomationFlowPreviewProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [addActionOpen, setAddActionOpen] = useState(false);

  const steps = useMemo(() => schemaToSteps(schema), [schema]);

  const triggerTableId = useMemo(() => {
    const trigger = steps.find((s) => s.kind === "trigger");
    return trigger?.config?.tableId ? Number(trigger.config.tableId) : undefined;
  }, [steps]);

  const actionCount = steps.filter((s) => s.kind === "action").length;
  const maxActions = TIER_ACTION_LIMITS[userPlan ?? "basic"] ?? 2;
  const canAddAction = actionCount < maxActions;

  const rebuildSchema = useCallback(
    (updatedSteps: FlowStep[]) => {
      const updated = stepsToSchema(schema.name, schema.description, updatedSteps);
      updated.category = schema.category;
      onSchemaChange(updated);
    },
    [schema.name, schema.description, schema.category, onSchemaChange]
  );

  const handleFieldChange = (stepId: string, fieldKey: string, value: any) => {
    const updatedSteps = steps.map((s) => {
      if (s.id !== stepId) return s;
      let newConfig = setNestedValue(s.config, fieldKey, value);
      if (fieldKey === "tableId") {
        const cfgs = s.kind === "trigger" ? TRIGGER_FIELD_CONFIGS : ACTION_FIELD_CONFIGS;
        const fields = cfgs[s.type] || [];
        for (const f of fields) {
          if (f.inputType === "column-select" || f.inputType === "column-value") {
            newConfig = setNestedValue(newConfig, f.key, "");
          }
        }
      }
      return { ...s, config: newConfig };
    });
    rebuildSchema(updatedSteps);
  };

  const handleTypeChange = (stepId: string, newType: string) => {
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    const labels = step.kind === "trigger" ? TRIGGER_LABELS : ACTION_LABELS;
    const updatedSteps = steps.map((s) => {
      if (s.id !== stepId) return s;
      return { ...s, type: newType, config: {}, label: labels[newType] || newType };
    });
    rebuildSchema(updatedSteps);
  };

  const handleRemoveStep = (stepId: string) => {
    const updatedSteps = steps.filter((s) => s.id !== stepId);
    rebuildSchema(updatedSteps);
  };

  const handleAddAction = (actionType: string) => {
    const newStep: FlowStep = {
      id: `step_new_${Date.now()}`,
      kind: "action",
      type: actionType,
      config: {},
      label: ACTION_LABELS[actionType] || actionType,
    };
    rebuildSchema([...steps, newStep]);
    setAddActionOpen(false);
  };

  const typeBadge = schema.actionType === "MULTI_ACTION"
    ? { label: "פעולות מרובות", color: "bg-purple-100 text-purple-600" }
    : { label: "רגילה", color: "bg-blue-100 text-blue-600" };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">
              תצוגה מקדימה
            </div>
            {editingName ? (
              <Input
                value={schema.name}
                onChange={(e) => onSchemaChange({ ...schema, name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                autoFocus
                className="text-xl font-bold text-gray-900 border-b-2 border-purple-400 h-auto py-1"
                dir="auto"
              />
            ) : (
              <h3
                className="text-xl font-bold text-gray-900 cursor-pointer hover:text-purple-700 transition"
                onClick={() => setEditingName(true)}
                title="לחץ לעריכה"
              >
                {schema.name}
              </h3>
            )}
            {editingDesc ? (
              <Input
                value={schema.description || ""}
                onChange={(e) => onSchemaChange({ ...schema, description: e.target.value })}
                onBlur={() => setEditingDesc(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingDesc(false)}
                autoFocus
                placeholder="תיאור האוטומציה..."
                className="text-sm text-gray-500 mt-1 h-auto py-1"
                dir="auto"
              />
            ) : (
              <p
                className="text-sm text-gray-500 mt-1 cursor-pointer hover:text-gray-700 transition"
                onClick={() => setEditingDesc(true)}
                title="לחץ לעריכה"
              >
                {schema.description || "לחץ להוספת תיאור..."}
              </p>
            )}
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 mr-2 ${typeBadge.color}`}
          >
            {typeBadge.label}
          </span>
        </div>
      </div>

      {/* Flow Canvas */}
      <ScrollArea className="flex-1 min-h-0 px-6 py-4">
        <div className="space-y-0" dir="rtl">
          {steps.map((step, i) => (
            <div key={step.id}>
              {i > 0 && <FlowConnector />}
              <FlowStepCard
                step={step}
                stepIndex={i + 1}
                tables={tables}
                users={users}
                onFieldChange={handleFieldChange}
                onTypeChange={handleTypeChange}
                onRemove={handleRemoveStep}
                canRemove={step.kind === "action" && actionCount > 1}
                triggerTableId={triggerTableId}
              />
            </div>
          ))}

          {/* Add Action Button */}
          <FlowConnector />
          {canAddAction ? (
            <Popover open={addActionOpen} onOpenChange={setAddActionOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-green-300 rounded-lg text-green-600 hover:border-green-400 hover:bg-green-50/50 transition text-sm font-medium">
                  <Plus className="w-4 h-4" />
                  + הוסף פעולה
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="center">
                <div className="space-y-0.5">
                  {SELECTABLE_ACTION_TYPES.map((t) => {
                    const TypeIcon = ACTION_ICONS[t];
                    return (
                      <button
                        key={t}
                        onClick={() => handleAddAction(t)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-right hover:bg-gray-100 text-gray-700 transition"
                      >
                        {TypeIcon && <TypeIcon className="w-4 h-4 shrink-0" />}
                        <span>{ACTION_LABELS[t] || t}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm font-medium cursor-default">
              שדרג תוכנית לפעולות נוספות
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={onReset}
            className="py-2 px-3 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 font-medium transition text-sm flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            התחל מחדש
          </button>
          <button
            onClick={onEdit}
            className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition text-sm flex items-center justify-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            ערוך את האוטומציה
          </button>
          <button
            onClick={onChatFocus}
            className="py-2 px-3 bg-gray-100 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-200 font-medium transition text-sm flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            שוחח עם AI
          </button>
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="w-full py-2.5 px-4 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 font-medium shadow-lg hover:shadow-xl transition disabled:opacity-70 flex justify-center items-center gap-2 text-sm"
        >
          {creating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              יוצר אוטומציה...
            </>
          ) : (
            <>
              <span className="text-lg">+</span> צור אוטומציה
            </>
          )}
        </button>
      </div>
    </div>
  );
}
