"use client";

import { useState, useEffect } from "react";

interface RelationPickerProps {
  tableId: number;
  value: any;
  onChange: (value: any) => void;
}

export default function RelationPicker({
  tableId,
  value,
  onChange,
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

  const filteredRecords = records
    .filter((r) => {
      if (!searchTerm) return true;
      // Search in all data values
      const searchStr = searchTerm.toLowerCase();
      return Object.values(r.data).some((v) =>
        String(v).toLowerCase().includes(searchStr)
      );
    })
    .slice(0, 50);

  const selectedRecord = records.find((r) => r.id === value);

  return (
    <div className="relative">
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedRecord ? "text-black" : "text-gray-500"}>
          {selectedRecord
            ? `Record #${selectedRecord.id} - ${
                Object.values(selectedRecord.data)[0] || ""
              }`
            : "Select a record..."}
        </span>
        <span className="text-gray-400">▼</span>
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
              filteredRecords.map((record) => (
                <div
                  key={record.id}
                  onClick={() => {
                    onChange(record.id);
                    setIsOpen(false);
                  }}
                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 text-black ${
                    value === record.id ? "bg-blue-50 font-medium" : ""
                  }`}
                >
                  <span className="font-mono text-gray-500 me-2">
                    #{record.id}
                  </span>
                  {String(Object.values(record.data)[0] || "Untitled")}
                </div>
              ))
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
