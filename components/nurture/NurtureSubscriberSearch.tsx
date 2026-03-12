"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, Plus, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SmartField } from "@/lib/nurture-fields";
import type { NurtureSubscriberFilter } from "@/app/nurture-hub/actions";

type SearchMode = "general" | "smart";

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [{ value: "contains", label: "מכיל" }],
  select: [{ value: "equals", label: "שווה ל" }],
  date: [
    { value: "before", label: "לפני" },
    { value: "after", label: "אחרי" },
  ],
  boolean: [{ value: "is", label: "הוא" }],
};

interface Props {
  smartFields: SmartField[];
  search: string;
  onSearchChange: (s: string) => void;
  filters: NurtureSubscriberFilter[];
  onFiltersChange: (f: NurtureSubscriberFilter[]) => void;
}

export default function NurtureSubscriberSearch({
  smartFields,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: Props) {
  const [mode, setMode] = useState<SearchMode>("general");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(search);

  // Sync external search to local
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const handleGeneralSearch = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 300);
  };

  const switchMode = (newMode: SearchMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (newMode === "general") {
      onFiltersChange([]);
    } else {
      setLocalSearch("");
      onSearchChange("");
    }
  };

  const addFilter = () => {
    const firstField = smartFields[0];
    const operators = OPERATORS_BY_TYPE[firstField.type] || OPERATORS_BY_TYPE.text;
    onFiltersChange([
      ...filters,
      { field: firstField.key, operator: operators[0].value, value: "" },
    ]);
  };

  const updateFilter = (index: number, partial: Partial<NurtureSubscriberFilter>) => {
    const updated = filters.map((f, i) => (i === index ? { ...f, ...partial } : f));
    // When field changes, reset operator and value
    if (partial.field) {
      const fieldDef = smartFields.find((sf) => sf.key === partial.field);
      const operators = OPERATORS_BY_TYPE[fieldDef?.type || "text"] || OPERATORS_BY_TYPE.text;
      updated[index] = { ...updated[index], operator: operators[0].value, value: "" };
    }
    onFiltersChange(updated);
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 mb-3">
      {/* Mode tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => switchMode("general")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            mode === "general"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Search className="w-3 h-3 inline ml-1" />
          חיפוש כללי
        </button>
        <button
          onClick={() => switchMode("smart")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            mode === "smart"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <SlidersHorizontal className="w-3 h-3 inline ml-1" />
          חיפוש חכם
        </button>
      </div>

      {/* General mode */}
      {mode === "general" && (
        <div className="relative">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={localSearch}
            onChange={(e) => handleGeneralSearch(e.target.value)}
            placeholder="חיפוש לפי שם, אימייל או טלפון..."
            className="pr-9 h-9 text-sm"
          />
          {localSearch && (
            <button
              onClick={() => handleGeneralSearch("")}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Smart mode */}
      {mode === "smart" && (
        <div className="space-y-2">
          {filters.map((filter, i) => {
            const fieldDef = smartFields.find((sf) => sf.key === filter.field);
            const operators = OPERATORS_BY_TYPE[fieldDef?.type || "text"] || OPERATORS_BY_TYPE.text;

            return (
              <div key={i} className="flex items-center gap-2">
                {/* Field */}
                <Select value={filter.field} onValueChange={(v) => updateFilter(i, { field: v })}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {smartFields.map((sf) => (
                      <SelectItem key={sf.key} value={sf.key} className="text-xs">
                        {sf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select value={filter.operator} onValueChange={(v) => updateFilter(i, { operator: v })}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                {fieldDef?.type === "select" ? (
                  <Select value={filter.value} onValueChange={(v) => updateFilter(i, { value: v })}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="בחר..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldDef.options?.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : fieldDef?.type === "date" ? (
                  <Input
                    type="date"
                    value={filter.value}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    className="flex-1 h-8 text-xs"
                    dir="ltr"
                  />
                ) : fieldDef?.type === "boolean" ? (
                  <Select value={filter.value} onValueChange={(v) => updateFilter(i, { value: v })}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="בחר..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true" className="text-xs">כן</SelectItem>
                      <SelectItem value="false" className="text-xs">לא</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={filter.value}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    placeholder="ערך..."
                    className="flex-1 h-8 text-xs"
                  />
                )}

                <button
                  onClick={() => removeFilter(i)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={addFilter}
            className="text-xs h-7 gap-1"
          >
            <Plus className="w-3 h-3" />
            הוסף פילטר
          </Button>
        </div>
      )}
    </div>
  );
}
