"use client";

import { useState, useEffect } from "react";

interface RelationPickerProps {
  tableId: number;
  value: any;
  onChange: (value: any) => void;
  allowMultiple?: boolean;
  displayField?: string;
}

export default function RelationPicker({
  tableId,
  value,
  onChange,
  allowMultiple = false,
  displayField,
}: RelationPickerProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen && records.length === 0) {
      fetchRecords();
    }
  }, [isOpen]);

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
    return String(Object.values(record.data)[0] || "Untitled");
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
      setIsOpen(false);
    }
  };

  const isSelected = (recordId: number) => {
    if (allowMultiple) {
      return Array.isArray(value) && value.includes(recordId);
    }
    return value === recordId;
  };

  const renderTrigger = () => {
    if (allowMultiple) {
      const selectedIds = Array.isArray(value) ? value : value ? [value] : [];
      if (selectedIds.length === 0) {
        return <span className="text-gray-500">Select records...</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((id: number) => {
            const record = records.find((r) => r.id === id);
            return (
              <span
                key={id}
                className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
              >
                {record ? getRecordLabel(record) : `#${id}`}
                <span
                  className="cursor-pointer hover:text-blue-900 font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(id);
                  }}
                >
                  ×
                </span>
              </span>
            );
          })}
        </div>
      );
    } else {
      const selectedRecord = records.find((r) => r.id === value);
      return (
        <span className={selectedRecord ? "text-black" : "text-gray-500"}>
          {selectedRecord
            ? `Record #${selectedRecord.id} - ${getRecordLabel(selectedRecord)}`
            : "Select a record..."}
        </span>
      );
    }
  };

  return (
    <div className="relative">
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer flex justify-between items-center min-h-[42px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1">{renderTrigger()}</div>
        <span className="text-gray-400 ml-2">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-blue-500 text-black"
              placeholder="Search..."
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Loading...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No records found
              </div>
            ) : (
              filteredRecords.map((record) => {
                const selected = isSelected(record.id);
                return (
                  <div
                    key={record.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(record.id);
                    }}
                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 text-black flex items-center justify-between ${
                      selected ? "bg-blue-50 font-medium" : ""
                    }`}
                  >
                    <div>
                      <span className="font-mono text-gray-500 me-2">
                        #{record.id}
                      </span>
                      {getRecordLabel(record)}
                    </div>
                    {selected && <span className="text-blue-600">✓</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </div>
  );
}
