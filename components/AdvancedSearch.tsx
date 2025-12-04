"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import SearchSettingsModal from "./SearchSettingsModal";

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
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`searchSettings_${tableId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    }
    // Default: first 3 searchable fields
    const searchableFields = schema
      .filter(
        (f) => f.type !== "relation" && f.type !== "file" && f.type !== "image"
      )
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
      console.error("Search error:", error);
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
      <div className="relative w-full" ref={dropdownRef}>
        <div className="flex gap-2">
          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition shadow-md hover:shadow-lg flex items-center gap-2 shrink-0"
            title="הגדרות חיפוש"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="hidden sm:inline">הגדרות</span>
          </button>

          {/* Search input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (results.length > 0) setShowDropdown(true);
              }}
              placeholder={`חיפוש ב-${searchSettings.searchableFields.length} עמודות...`}
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black"
              disabled={searchSettings.searchableFields.length === 0}
            />
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              {isLoading ? (
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Active settings indicator */}
        {searchSettings.searchableFields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="text-xs text-gray-500">חיפוש ב:</div>
            {searchSettings.searchableFields.slice(0, 3).map((fieldName) => (
              <span
                key={fieldName}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
              >
                {getFieldLabel(fieldName)}
              </span>
            ))}
            {searchSettings.searchableFields.length > 3 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                +{searchSettings.searchableFields.length - 3} עוד
              </span>
            )}
          </div>
        )}

        {/* No settings warning */}
        {searchSettings.searchableFields.length === 0 && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ לא נבחרו עמודות לחיפוש. לחץ על כפתור ההגדרות לבחירת עמודות.
            </p>
          </div>
        )}

        {/* Results dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs text-gray-500 px-3 py-2 font-medium">
                {results.length} {results.length === 1 ? "תוצאה" : "תוצאות"}
              </div>
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleRecordSelect(result.id)}
                  className="w-full text-right px-3 py-3 hover:bg-blue-50 rounded-lg transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate group-hover:text-blue-600">
                        {result.displayTitle}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-1">
                        {searchSettings.displayFields
                          .slice(0, 3)
                          .map((fieldName) => {
                            const value = result.data[fieldName];
                            if (!value) return null;
                            return (
                              <div key={fieldName} className="truncate">
                                <span className="font-medium">
                                  {getFieldLabel(fieldName)}:
                                </span>{" "}
                                {String(value).substring(0, 40)}
                                {String(value).length > 40 && "..."}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">
                      #{result.id}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No results message */}
        {showDropdown &&
          results.length === 0 &&
          searchQuery.length >= 2 &&
          !isLoading && (
            <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
              <div className="text-center text-gray-500 text-sm">
                לא נמצאו תוצאות
              </div>
            </div>
          )}
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
