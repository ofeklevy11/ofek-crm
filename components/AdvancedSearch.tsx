"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import SearchSettingsModal from "./SearchSettingsModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, Search, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface SchemaField {
  name: string;
  type: string;
  label: string;
}

interface SearchResult {
  id: number;
  displayTitle: string;
  data: Record<string, any>;
  tableId: number;
}

interface SearchSettings {
  searchableFields: string[];
  displayFields: string[];
}

interface AdvancedSearchProps {
  tableId: number;
  schema: SchemaField[];
  onRecordSelect?: (recordId: number) => void;
}

export default function AdvancedSearch({
  tableId,
  schema,
  onRecordSelect,
}: AdvancedSearchProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load settings from localStorage or use defaults
  const [searchSettings, setSearchSettings] = useState<SearchSettings>(() => {
    // Helper to validate fields against schema
    const validateFields = (fields: string[]) => {
      return fields.filter((fieldName) =>
        schema.some((f) => f.name === fieldName)
      );
    };

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`searchSettings_${tableId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            searchableFields: validateFields(parsed.searchableFields || []),
            displayFields: validateFields(parsed.displayFields || []),
          };
        } catch (e) {
          console.error("Failed to parse search settings", e);
        }
      }
    }
    // Default: first 3 searchable fields (including relations)
    const searchableFields = schema
      .filter((f) => f.type !== "file" && f.type !== "image")
      .slice(0, 3)
      .map((f) => f.name);

    return {
      searchableFields,
      displayFields: searchableFields,
    };
  });

  // Save settings to localStorage
  const handleSaveSettings = (settings: SearchSettings) => {
    setSearchSettings(settings);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        `searchSettings_${tableId}`,
        JSON.stringify(settings)
      );
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Search function with debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch();
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, searchSettings]);

  const performSearch = async () => {
    if (searchSettings.searchableFields.length === 0) {
      alert("אנא הגדר עמודות לחיפוש תחילה");
      setShowSettingsModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "5",
        searchFields: searchSettings.searchableFields.join(","),
        displayFields: searchSettings.displayFields.join(","),
      });

      const response = await fetch(
        `/api/tables/${tableId}/search?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        setResults(data);
        setShowDropdown(data.length > 0);
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordSelect = (recordId: number) => {
    setShowDropdown(false);
    setSearchQuery("");
    setResults([]);

    if (onRecordSelect) {
      onRecordSelect(recordId);
    }
  };

  const getFieldLabel = (fieldName: string) => {
    return schema.find((f) => f.name === fieldName)?.label || fieldName;
  };

  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-primary" />
          חיפוש חכם
        </h3>
        <div className="relative w-full" ref={dropdownRef}>
          <div className="flex gap-2">
            {/* Settings Button */}
            <Button
              variant="outline"
              className="gap-2 shrink-0 bg-background"
              onClick={() => setShowSettingsModal(true)}
              title="הגדרות חיפוש"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">הגדרות</span>
            </Button>

            {/* Search input */}
            <div className="relative flex-1 group">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (results.length > 0) setShowDropdown(true);
                }}
                placeholder={`חיפוש ב-${searchSettings.searchableFields.length} עמודות...`}
                className="pr-10 bg-background border-muted-foreground/20 focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm group-hover:shadow-md"
                disabled={searchSettings.searchableFields.length === 0}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground transition-colors group-hover:text-primary">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </div>
            </div>
          </div>

          {/* Active settings indicator */}
          {searchSettings.searchableFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="text-xs text-muted-foreground self-center">
                חיפוש ב:
              </div>
              {searchSettings.searchableFields.slice(0, 3).map((fieldName) => (
                <Badge
                  key={fieldName}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {getFieldLabel(fieldName)}
                </Badge>
              ))}
              {searchSettings.searchableFields.length > 3 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{searchSettings.searchableFields.length - 3} עוד
                </Badge>
              )}
            </div>
          )}

          {/* No settings warning */}
          {searchSettings.searchableFields.length === 0 && (
            <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ לא נבחרו עמודות לחיפוש. לחץ על כפתור ההגדרות לבחירת עמודות.
              </p>
            </div>
          )}

          {/* Results dropdown */}
          {showDropdown && results.length > 0 && (
            <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
              <div className="p-1">
                <div className="text-xs text-muted-foreground px-3 py-2 font-medium">
                  {results.length} {results.length === 1 ? "תוצאה" : "תוצאות"}
                </div>
                {results.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleRecordSelect(result.id)}
                    className="w-full text-right px-3 py-3 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-foreground">
                          {result.displayTitle}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 space-y-1">
                          {searchSettings.displayFields
                            .slice(0, 3)
                            .map((fieldName) => {
                              const value = result.data[fieldName];
                              if (!value) return null;

                              // Check if it's a resolved relation field
                              const displayValue =
                                typeof value === "object" &&
                                value._displayValue !== undefined
                                  ? value._displayValue
                                  : String(value);

                              return (
                                <div key={fieldName} className="truncate">
                                  <span className="font-medium text-foreground/80">
                                    {getFieldLabel(fieldName)}:
                                  </span>{" "}
                                  {displayValue.substring(0, 40)}
                                  {displayValue.length > 40 && "..."}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono shrink-0"
                      >
                        #{result.id}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results message */}
          {showDropdown &&
            results.length === 0 &&
            searchQuery.length >= 2 &&
            !isLoading && (
              <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-lg shadow-lg p-4">
                <div className="text-center text-muted-foreground text-sm">
                  לא נמצאו תוצאות
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <SearchSettingsModal
          schema={schema}
          currentSettings={searchSettings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </>
  );
}
