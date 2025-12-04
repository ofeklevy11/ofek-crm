"use client";

import { useState, useEffect } from "react";

interface SchemaField {
  name: string;
  type: string;
  label: string;
}

interface SearchSettings {
  searchableFields: string[];
  displayFields: string[];
}

interface SearchSettingsModalProps {
  schema: SchemaField[];
  currentSettings: SearchSettings;
  onSave: (settings: SearchSettings) => void;
  onClose: () => void;
}

export default function SearchSettingsModal({
  schema,
  currentSettings,
  onSave,
  onClose,
}: SearchSettingsModalProps) {
  const [searchableFields, setSearchableFields] = useState<string[]>(
    currentSettings.searchableFields
  );
  const [displayFields, setDisplayFields] = useState<string[]>(
    currentSettings.displayFields
  );

  // Get fields that can be searched (exclude only files and images)
  const availableFields = schema.filter(
    (field) => field.type !== "file" && field.type !== "image"
  );

  const toggleSearchableField = (fieldName: string) => {
    setSearchableFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const toggleDisplayField = (fieldName: string) => {
    setDisplayFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const selectAllSearchable = () => {
    setSearchableFields(availableFields.map((f) => f.name));
  };

  const clearAllSearchable = () => {
    setSearchableFields([]);
  };

  const selectAllDisplay = () => {
    setDisplayFields(availableFields.map((f) => f.name));
  };

  const clearAllDisplay = () => {
    setDisplayFields([]);
  };

  const handleSave = () => {
    if (searchableFields.length === 0) {
      alert("יש לבחור לפחות עמודה אחת לחיפוש");
      return;
    }
    if (displayFields.length === 0) {
      alert("יש לבחור לפחות עמודה אחת להצגה");
      return;
    }
    onSave({ searchableFields, displayFields });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                ⚙️ הגדרות חיפוש מתקדם
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                בחר את העמודות לחיפוש והצגת תוצאות
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Searchable Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-blue-500">🔍</span>
                  עמודות לחיפוש
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSearchable}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    בחר הכל
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={clearAllSearchable}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    נקה
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                החיפוש יתבצע רק בעמודות שנבחרו
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {availableFields.map((field) => (
                  <label
                    key={field.name}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white cursor-pointer transition group"
                  >
                    <input
                      type="checkbox"
                      checked={searchableFields.includes(field.name)}
                      onChange={() => toggleSearchableField(field.name)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 group-hover:text-blue-600 transition">
                        {field.label}
                      </div>
                      <div className="text-xs text-gray-500">{field.type}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{searchableFields.length}</strong> עמודות נבחרו לחיפוש
                </p>
              </div>
            </div>

            {/* Display Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-green-500">👁️</span>
                  עמודות להצגה
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllDisplay}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    בחר הכל
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={clearAllDisplay}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    נקה
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                העמודות שיוצגו בתוצאות החיפוש
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {availableFields.map((field) => (
                  <label
                    key={field.name}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white cursor-pointer transition group"
                  >
                    <input
                      type="checkbox"
                      checked={displayFields.includes(field.name)}
                      onChange={() => toggleDisplayField(field.name)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-5 w-5"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 group-hover:text-green-600 transition">
                        {field.label}
                      </div>
                      <div className="text-xs text-gray-500">{field.type}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <strong>{displayFields.length}</strong> עמודות נבחרו להצגה
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition shadow-lg hover:shadow-xl"
          >
            💾 שמור הגדרות
          </button>
        </div>
      </div>
    </div>
  );
}
