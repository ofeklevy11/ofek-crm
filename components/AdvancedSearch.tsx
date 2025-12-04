"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
  const [selectedField, setSelectedField] = useState(""); // כל השדות או שדה ספציפי
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  }, [searchQuery, selectedField]);

  const performSearch = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "5",
      });

      if (selectedField) {
        params.append("field", selectedField);
      }

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

  // Get searchable fields (exclude relation fields for simplicity)
  const searchableFields = schema.filter(
    (field) =>
      field.type !== "relation" &&
      field.type !== "file" &&
      field.type !== "image"
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="flex gap-2">
        {/* Field selector */}
        <select
          value={selectedField}
          onChange={(e) => setSelectedField(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-black min-w-[150px]"
        >
          <option value="">כל העמודות</option>
          {searchableFields.map((field) => (
            <option key={field.name} value={field.name}>
              {field.label}
            </option>
          ))}
        </select>

        {/* Search input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setShowDropdown(true);
            }}
            placeholder={
              selectedField
                ? `חיפוש ב${
                    searchableFields.find((f) => f.name === selectedField)
                      ?.label || ""
                  }...`
                : "חיפוש רשומה..."
            }
            className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black"
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

      {/* Results dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs text-gray-500 px-3 py-2 font-medium">
              {results.length} {results.length === 1 ? "תוצאה" : "תוצאות"}
            </div>
            {results.map((result, index) => (
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
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {selectedField ? (
                        // Show the specific field value
                        <span>
                          {searchableFields.find(
                            (f) => f.name === selectedField
                          )?.label || selectedField}
                          :{" "}
                          {String(result.data[selectedField] || "").substring(
                            0,
                            50
                          )}
                        </span>
                      ) : (
                        // Show preview of all fields
                        Object.entries(result.data)
                          .filter(([key, val]) => val)
                          .slice(0, 2)
                          .map(([key, val]) => {
                            const field = schema.find((f) => f.name === key);
                            return `${field?.label || key}: ${String(
                              val
                            ).substring(0, 30)}`;
                          })
                          .join(" • ")
                      )}
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
  );
}
