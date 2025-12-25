"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface RelationPickerProps {
  tableId: number;
  value: any;
  onChange: (value: any) => void;
  allowMultiple?: boolean;
  displayField?: string;
  className?: string;
}

export default function RelationPicker({
  tableId,
  value,
  onChange,
  allowMultiple = false,
  displayField,
  className,
}: RelationPickerProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && records.length === 0) {
      fetchRecords();
    }
  }, [open]);

  // Also fetch records if we have a value but no records (to display the selected label)
  useEffect(() => {
    if (value && records.length === 0) {
      fetchRecords();
    }
  }, [value]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/records`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      console.error("Failed to fetch relation records", error);
    } finally {
      setLoading(false);
    }
  };

  const getRecordLabel = (record: any) => {
    if (!record) return "";
    if (displayField && record.data[displayField]) {
      return String(record.data[displayField]);
    }
    // Fallback to first value
    return String(Object.values(record.data)[0] || "ללא כותרת");
  };

  const filteredRecords = records
    .filter((r) => {
      if (!searchTerm) return true;
      const searchStr = searchTerm.toLowerCase();
      // Search in display field if available, otherwise all fields
      if (displayField && r.data[displayField]) {
        return String(r.data[displayField]).toLowerCase().includes(searchStr);
      }
      return Object.values(r.data).some((v) =>
        String(v).toLowerCase().includes(searchStr)
      );
    })
    .slice(0, 50);

  const handleSelect = (recordId: number) => {
    if (allowMultiple) {
      const currentValues = Array.isArray(value) ? value : value ? [value] : [];
      const newValues = currentValues.includes(recordId)
        ? currentValues.filter((id: number) => id !== recordId)
        : [...currentValues, recordId];
      onChange(newValues);
    } else {
      onChange(recordId);
      setOpen(false);
    }
  };

  const isSelected = (recordId: number) => {
    if (allowMultiple) {
      return Array.isArray(value) && value.includes(recordId);
    }
    return value === recordId;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-[44px] py-2 px-3 hover:bg-background/90",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 items-center w-full">
            {allowMultiple
              ? (() => {
                  const selectedIds = Array.isArray(value)
                    ? value
                    : value
                    ? [value]
                    : [];
                  if (selectedIds.length === 0) {
                    return (
                      <span className="text-muted-foreground font-normal">
                        בחר רשומות...
                      </span>
                    );
                  }
                  return selectedIds.map((id: number) => {
                    const record = records.find((r) => r.id === id);
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs px-2 py-0.5 gap-1 hover:bg-secondary/80 bg-primary/10 text-primary border-primary/20"
                      >
                        {record ? getRecordLabel(record) : `#${id}`}
                        <div
                          className="cursor-pointer hover:text-destructive transition-colors rounded-full p-0.5"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            handleSelect(id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </div>
                      </Badge>
                    );
                  });
                })()
              : // Single select
                (() => {
                  const selectedRecord = records.find((r) => r.id === value);
                  return (
                    <span
                      className={cn(
                        "truncate font-normal",
                        !selectedRecord && "text-muted-foreground"
                      )}
                    >
                      {selectedRecord
                        ? getRecordLabel(selectedRecord)
                        : "בחר רשומה..."}
                    </span>
                  );
                })()}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex items-center border-b px-3" dir="rtl">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="חיפוש..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1" dir="rtl">
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              טוען...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              לא נמצאו תוצאות.
            </div>
          ) : (
            filteredRecords.map((record) => {
              const selected = isSelected(record.id);
              return (
                <div
                  key={record.id}
                  onClick={() => handleSelect(record.id)}
                  className={cn(
                    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    selected && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{getRecordLabel(record)}</span>
                  <span className="mr-auto text-xs text-muted-foreground/70 font-mono">
                    #{record.id}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
