"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditRecordModal from "./EditRecordModal";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
}

interface RecordTableProps {
  tableId: number;
  schema: SchemaField[];
  initialRecords: any[];
}

export default function RecordTable({
  tableId,
  schema,
  initialRecords,
}: RecordTableProps) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((sid) => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} records?`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/records/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", recordIds: selectedIds }),
      });
      if (!res.ok) throw new Error("Failed to delete");

      setRecords(records.filter((r) => !selectedIds.includes(r.id)));
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Error deleting records");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCSV = () => {
    const recordsToExport =
      selectedIds.length > 0
        ? records.filter((r) => selectedIds.includes(r.id))
        : records;

    if (recordsToExport.length === 0) {
      alert("No records to export");
      return;
    }

    // Generate CSV headers
    const headers = ["ID", ...schema.map((f) => f.label), "Created At"];
    // Use semicolon delimiter for better Excel compatibility with international characters
    const csvContent = [
      headers.join(";"),
      ...recordsToExport.map((record) => {
        const row = [
          record.id,
          ...schema.map((field) => {
            const val = record.data[field.name];
            const stringVal = String(val ?? "");
            // Escape quotes and wrap in quotes
            return `"${stringVal.replace(/"/g, '""')}"`;
          }),
          new Date(record.createdAt).toLocaleDateString(),
        ];
        return row.join(";");
      }),
    ].join("\n");

    // Add UTF-8 BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csvWithBOM = BOM + csvContent;

    // Create a Blob from the CSV content
    const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Create a link and trigger the download
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `table_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = (format: "csv" | "txt") => {
    window.location.href = `/api/tables/${tableId}/export?format=${format}`;
  };

  const handleExportTXT = () => {
    const recordsToExport =
      selectedIds.length > 0
        ? records.filter((r) => selectedIds.includes(r.id))
        : records;

    if (recordsToExport.length === 0) {
      alert("No records to export");
      return;
    }

    // Generate tab-delimited content
    const headers = ["ID", ...schema.map((f) => f.label), "Created At"];
    const txtContent = [
      headers.join("\t"),
      ...recordsToExport.map((record) => {
        const row = [
          record.id,
          ...schema.map((field) => {
            const val = record.data[field.name];
            return String(val ?? "");
          }),
          new Date(record.createdAt).toLocaleDateString(),
        ];
        return row.join("\t");
      }),
    ].join("\n");

    // Add UTF-8 BOM
    const BOM = "\uFEFF";
    const txtWithBOM = BOM + txtContent;

    // Create a Blob from the TXT content
    const blob = new Blob([txtWithBOM], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Create a link and trigger the download
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `table_export_${new Date().toISOString().split("T")[0]}.txt`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <div className="text-sm text-black">{selectedIds.length} selected</div>
        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <div className="relative group">
              <button className="bg-white border border-gray-300 text-black px-3 py-1 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Export Selected ▼
              </button>
              <div className="hidden group-hover:block absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[150px]">
                <button
                  onClick={handleExportCSV}
                  className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50 rounded-t-lg"
                >
                  Export as CSV
                </button>
                <button
                  onClick={handleExportTXT}
                  className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50 rounded-b-lg"
                >
                  Export as TXT
                </button>
              </div>
            </div>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-red-100 transition"
            >
              {isDeleting ? "Deleting..." : "Delete Selected"}
            </button>
          </div>
        )}
        {selectedIds.length === 0 && (
          <div className="relative group">
            <button className="bg-white border border-gray-300 text-black px-3 py-1 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Export All ▼
            </button>
            <div className="hidden group-hover:block absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[150px]">
              <button
                onClick={() => handleExportAll("csv")}
                className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50 rounded-t-lg"
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExportAll("txt")}
                className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50 rounded-b-lg"
              >
                Export as TXT
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-black font-medium border-b border-gray-100">
            <tr>
              <th className="p-4 w-10">
                <input
                  type="checkbox"
                  checked={
                    records.length > 0 && selectedIds.length === records.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="p-4">ID</th>
              {schema.map((field) => (
                <th key={field.name} className="p-4 whitespace-nowrap">
                  {field.label}
                </th>
              ))}
              <th className="p-4">Attachments</th>
              <th className="p-4">Created At</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-gray-50 transition">
                <td className="p-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(record.id)}
                    onChange={() => toggleSelect(record.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="p-4 text-black">#{record.id}</td>
                {schema.map((field) => (
                  <td key={field.name} className="p-4 text-black">
                    {/* Basic rendering of JSON data */}
                    {String(record.data[field.name] ?? "-")}
                  </td>
                ))}
                <td className="p-4 text-black">
                  {record._count?.attachments || 0}
                </td>
                <td className="p-4 text-black">
                  {new Date(record.createdAt).toLocaleDateString()}
                </td>
                <td className="p-4">
                  <button
                    onClick={() => setEditingRecord(record)}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td
                  colSpan={schema.length + 5}
                  className="p-8 text-center text-black"
                >
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          schema={schema}
          onClose={() => {
            setEditingRecord(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
