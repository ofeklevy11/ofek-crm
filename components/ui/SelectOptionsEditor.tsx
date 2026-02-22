"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ColorPicker, PRESET_COLORS } from "@/components/ui/ColorPicker";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { showAlert } from "@/hooks/use-modal";

export interface SelectOption {
  value: string;
  color?: string;
}

interface SelectOptionsEditorProps {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
  placeholder?: string;
}

export function SelectOptionsEditor({
  options,
  onChange,
  placeholder = "שם האפשרות",
}: SelectOptionsEditorProps) {
  const [newOptionValue, setNewOptionValue] = useState("");

  const handleAddOption = () => {
    if (!newOptionValue.trim()) return;
    if (options.some((o) => o.value === newOptionValue.trim())) {
      showAlert("אפשרות זו כבר קיימת");
      return;
    }
    onChange([...options, { value: newOptionValue.trim(), color: "" }]);
    setNewOptionValue("");
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = [...options];
    newOptions.splice(index, 1);
    onChange(newOptions);
  };

  const handleValueChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], value };
    onChange(newOptions);
  };

  const handleColorChange = (index: number, color: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], color };
    onChange(newOptions);
  };

  return (
    <div className="space-y-3">
      {/* Existing Options */}
      <div className="space-y-2">
        {options.map((option, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-border group"
          >
            <div className="flex-1">
              <Input
                type="text"
                value={option.value}
                onChange={(e) => handleValueChange(index, e.target.value)}
                className="h-8 text-sm"
                placeholder={placeholder}
              />
            </div>
            <div className="flex items-center gap-1">
              <ColorPicker
                value={option.color}
                onChange={(color) => handleColorChange(index, color)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveOption(index)}
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Option */}
      <div className="flex gap-2">
        <Input
          type="text"
          value={newOptionValue}
          onChange={(e) => setNewOptionValue(e.target.value)}
          placeholder="הוסף אפשרות חדשה..."
          className="h-9 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddOption();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddOption}
          disabled={!newOptionValue.trim()}
          className="h-9 px-3 gap-1"
        >
          <Plus className="h-4 w-4" />
          הוסף
        </Button>
      </div>

      {/* Preview */}
      {options.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <Label className="text-xs text-muted-foreground mb-2 block">
            תצוגה מקדימה:
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {options.map((option, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: option.color || "#E5E7EB",
                  color: option.color ? "#FFFFFF" : "#374151",
                }}
              >
                {option.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function
function getTextColorForBg(bgColor: string): string {
  const preset = PRESET_COLORS.find((c) => c.value === bgColor);
  if (preset) return preset.textColor;

  if (!bgColor || !bgColor.startsWith("#")) return "#000000";

  const hex = bgColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#1F2937" : "#FFFFFF";
}

// Utility to parse comma-separated options string to SelectOption array
export function parseOptionsString(optionsStr: string): SelectOption[] {
  if (!optionsStr) return [];
  return optionsStr
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((value) => ({ value, color: "" }));
}

// Utility to convert SelectOption array to comma-separated string (for backward compat)
export function optionsToString(options: SelectOption[]): string {
  return options.map((o) => o.value).join(", ");
}

// Utility to parse optionColors from schema format
export function parseOptionsWithColors(
  optionsArr?: string[],
  optionColors?: Record<string, string>,
): SelectOption[] {
  if (!optionsArr) return [];
  return optionsArr.map((value) => ({
    value,
    color: optionColors?.[value] || "",
  }));
}

// Utility to convert SelectOption array to schema format
export function optionsToSchemaFormat(options: SelectOption[]): {
  options: string[];
  optionColors: Record<string, string>;
} {
  const optionsArr = options.map((o) => o.value);
  const optionColors: Record<string, string> = {};
  options.forEach((o) => {
    if (o.color) {
      optionColors[o.value] = o.color;
    }
  });
  return { options: optionsArr, optionColors };
}
