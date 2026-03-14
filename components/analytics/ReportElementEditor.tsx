"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X } from "lucide-react";

interface TextEditorProps {
  type: "input" | "textarea";
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
  label?: string;
}

export function TextEditor({ type, value, onSave, onCancel, placeholder, label }: TextEditorProps) {
  const [draft, setDraft] = useState(value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && type === "input") {
      e.preventDefault();
      onSave(draft);
    }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-start gap-2 w-full">
      {type === "input" ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label || placeholder || "ערוך ערך"}
          className="flex-1"
          autoFocus
        />
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label || placeholder || "ערוך ערך"}
          className="flex-1 min-h-[60px]"
          autoFocus
        />
      )}
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => onSave(draft)} aria-label="שמור">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:bg-gray-100" onClick={onCancel} aria-label="בטל">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface SelectEditorProps {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void;
  label?: string;
}

export function SelectEditor({ value, options, onSave, label }: SelectEditorProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-500 shrink-0">{label}</span>}
      <Select value={value} onValueChange={onSave}>
        <SelectTrigger className="h-8 text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Chart type options
export const CHART_TYPE_OPTIONS = [
  { value: "bar", label: "עמודות" },
  { value: "line", label: "קו" },
  { value: "pie", label: "עוגה" },
  { value: "area", label: "שטח" },
];

// Date range options
export const DATE_RANGE_OPTIONS = [
  { value: "all", label: "הכל" },
  { value: "this_week", label: "השבוע" },
  { value: "last_30_days", label: "30 ימים אחרונים" },
  { value: "last_year", label: "שנה אחרונה" },
];

// Y-axis measure options
export const Y_AXIS_OPTIONS = [
  { value: "count", label: "ספירה" },
  { value: "sum", label: "סכום" },
  { value: "avg", label: "ממוצע" },
];

// View type options
export const VIEW_TYPE_OPTIONS = [
  { value: "COUNT", label: "ספירה/פילוח" },
  { value: "CONVERSION", label: "אחוז המרה" },
  { value: "GRAPH", label: "גרף" },
];
