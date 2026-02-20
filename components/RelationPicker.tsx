"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface RelationPickerProps {
  tableId: number;
  value: any;
  onChange: (value: any) => void;
  allowMultiple?: boolean;
  displayField?: string;
  className?: string;
  // Shared cache across multiple pickers in the same form (keyed by tableId)
  sharedCache?: React.MutableRefObject<Record<number, any[]>>;
}

export default function RelationPicker({
  tableId,
  value,
  onChange,
  allowMultiple = false,
  displayField,
  className,
  sharedCache,
}: RelationPickerProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  // Cache for selected record labels (so we can display them without re-fetching everything)
  const selectedRecordsCache = useRef<Record<number, any>>({});
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch records from server with optional search query
  const fetchRecords = useCallback(async (query: string = "") => {
    // For initial load (no query), check shared cache first
    if (!query && sharedCache?.current[tableId]) {
      const cached = sharedCache.current[tableId];
      setRecords(cached);
      cached.forEach((r: any) => {
        selectedRecordsCache.current[r.id] = r;
      });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ for: "picker", limit: "50" });
      if (query) params.set("q", query);
      const res = await fetch(`/api/tables/${tableId}/records?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
        // Update per-picker cache
        data.forEach((r: any) => {
          selectedRecordsCache.current[r.id] = r;
        });
        // Populate shared cache for initial loads (no search query)
        if (!query && sharedCache) {
          sharedCache.current[tableId] = data;
        }
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, [tableId, sharedCache]);

  // Fetch selected records for label display (only IDs not already cached)
  useEffect(() => {
    if (!value) return;
    const ids = Array.isArray(value) ? value : [value];
    const uncachedIds = ids.filter((id: number) => !selectedRecordsCache.current[id]);
    if (uncachedIds.length === 0) return;

    // Fetch initial records to populate cache for selected values
    fetchRecords();
  }, [value, fetchRecords]);

  // Fetch initial records when popover opens
  useEffect(() => {
    if (open) {
      fetchRecords(searchTerm);
    }
  }, [open]);

  // Debounced server-side search
  useEffect(() => {
    if (!open) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchRecords(searchTerm);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchTerm, open, fetchRecords]);

  const getRecordLabel = (record: any) => {
    if (!record) return "";
    if (displayField && record.data[displayField]) {
      return String(record.data[displayField]);
    }
    // Fallback to first value
    return String(Object.values(record.data)[0] || "ללא כותרת");
  };

  // Get label for a selected record (from cache or current records)
  const getSelectedLabel = (id: number) => {
    const cached = selectedRecordsCache.current[id];
    if (cached) return getRecordLabel(cached);
    const found = records.find((r) => r.id === id);
    if (found) return getRecordLabel(found);
    return `#${id}`;
  };

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
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs px-2 py-0.5 gap-1 hover:bg-secondary/80 bg-primary/10 text-primary border-primary/20"
                      >
                        {getSelectedLabel(id)}
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
                  return (
                    <span
                      className={cn(
                        "truncate font-normal",
                        !value && "text-muted-foreground"
                      )}
                    >
                      {value
                        ? getSelectedLabel(value)
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
          ) : records.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              לא נמצאו תוצאות.
            </div>
          ) : (
            records.map((record) => {
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
