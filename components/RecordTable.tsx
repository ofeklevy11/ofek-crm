"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import EditRecordModal from "./EditRecordModal";
import ViewTextModal from "./ViewTextModal";
import AdvancedSearch from "./AdvancedSearch";
import ViewsPanel from "./ViewsPanel";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
  relationTableId?: number;
  displayField?: string;
}

interface RecordTableProps {
  tableId: number;
  schema: SchemaField[];
  initialRecords: any[];
  slug?: string;
  views?: Array<{
    id: number;
    name: string;
    slug: string;
    config: any;
    isEnabled: boolean;
  }>;
}

export default function RecordTable({
  tableId,
  schema,
  initialRecords,
  slug,
  views = [],
}: RecordTableProps) {
  const router = useRouter();
  const [records, setRecords] = useState<any[]>(initialRecords ?? []);

  useEffect(() => {
    if (initialRecords) {
      setRecords(initialRecords);
    }
  }, [initialRecords]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  // Dynamic filters - one state for each select/multi-select field
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [viewText, setViewText] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [relatedData, setRelatedData] = useState<Record<string, any>>({});
  const [highlightedRecordId, setHighlightedRecordId] = useState<number | null>(
    null
  );
  const recordRefs = useRef<Record<number, HTMLTableRowElement>>({});

  // Fetch related data
  useEffect(() => {
    const fetchRelatedData = async () => {
      const relationFields = schema.filter(
        (f) => f.type === "relation" && f.relationTableId
      );
      const newRelatedData: Record<string, any> = {};

      await Promise.all(
        relationFields.map(async (field) => {
          if (!field.relationTableId) return;
          try {
            // Fetch all records from the related table
            // Optimization: In a real app, we should only fetch referenced IDs
            const res = await fetch(
              `/api/tables/${field.relationTableId}/records`
            );
            if (res.ok) {
              const data = await res.json();
              // Index by ID for fast lookup
              const dataMap: Record<number, any> = {};
              data.forEach((r: any) => {
                dataMap[r.id] = r;
              });
              newRelatedData[field.relationTableId!] = dataMap;
            }
          } catch (error) {
            console.error(
              `Failed to fetch related table ${field.relationTableId}`,
              error
            );
          }
        })
      );

      setRelatedData(newRelatedData);
    };

    fetchRelatedData();
  }, [schema]);

  // Scroll to highlighted record
  useEffect(() => {
    if (highlightedRecordId && recordRefs.current[highlightedRecordId]) {
      recordRefs.current[highlightedRecordId].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // Remove highlight after 3 seconds
      const timeout = setTimeout(() => {
        setHighlightedRecordId(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [highlightedRecordId]);

  // Handler for when a record is selected from search
  const handleRecordSelect = (recordId: number) => {
    setHighlightedRecordId(recordId);
    // Open edit modal for the selected record
    const record = records.find((r) => r.id === recordId);
    if (record) {
      setEditingRecord(record);
    }
  };

  // unique fields (avoid recomputing/filtering multiple times)
  const uniqueFields = schema.filter(
    (field, index, self) =>
      index === self.findIndex((t) => t.name === field.name)
  );

  // helper: find status and source fields (for row coloring and dashboard widgets)
  const statusField = schema.find(
    (f) =>
      f.name.toLowerCase() === "status" ||
      f.label === "סטטוס" ||
      f.label.toLowerCase() === "status" ||
      f.label.includes("סטטוס")
  );
  const statusFieldName = statusField?.name;

  const sourceFieldName = schema.find(
    (f) =>
      f.name.includes("source") ||
      f.label.toLowerCase().includes("source") ||
      f.label.includes("מקור")
  )?.name;

  const activeBooleanFieldName = schema.find(
    (f) =>
      f.type === "boolean" &&
      (f.name.toLowerCase().includes("active") || f.label.includes("פעיל"))
  )?.name;

  // Get all filterable fields (select and multi-select)
  const filterableFields = schema.filter(
    (f) => f.type === "select" || f.type === "multi-select"
  );

  // Filter records based on all active filters
  const filteredRecords = records.filter((record) => {
    // Check each active filter
    for (const [fieldName, filterValue] of Object.entries(filters)) {
      if (!filterValue) continue; // Skip empty filters

      const recordValue = record.data?.[fieldName];

      // For multi-select fields, check if array includes the filter value
      if (Array.isArray(recordValue)) {
        if (!recordValue.includes(filterValue)) return false;
      } else {
        // For select fields, check exact match
        if (recordValue !== filterValue) return false;
      }
    }
    return true;
  });

  // Time-based stats
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const newLeadsWeek = records.filter(
    (r) => r.createdAt && new Date(r.createdAt) >= startOfWeek
  ).length;
  const newLeadsMonth = records.filter(
    (r) => r.createdAt && new Date(r.createdAt) >= startOfMonth
  ).length;

  const getPercentage = (count: number) => {
    const total = records.length;
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map((r) => r.id));
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

      setRecords((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
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

    const headers = ["ID", ...uniqueFields.map((f) => f.label), "Created At"];
    const csvContent = [headers.join(";")]
      .concat(
        recordsToExport.map((record) => {
          const row = [
            record.id,
            ...uniqueFields.map((field) => {
              const val = record.data?.[field.name];
              const stringVal = String(val ?? "");
              return `"${stringVal.replace(/"/g, '""')}"`;
            }),
            new Date(record.createdAt).toLocaleDateString(),
          ];
          return row.join(";");
        })
      )
      .join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
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

  const handleExportTXT = () => {
    const recordsToExport =
      selectedIds.length > 0
        ? records.filter((r) => selectedIds.includes(r.id))
        : records;

    if (recordsToExport.length === 0) {
      alert("No records to export");
      return;
    }

    const headers = ["ID", ...uniqueFields.map((f) => f.label), "Created At"];
    const txtContent = [headers.join("\t")]
      .concat(
        recordsToExport.map((record) => {
          const row = [
            record.id,
            ...uniqueFields.map((field) => {
              const val = record.data?.[field.name];
              return String(val ?? "");
            }),
            new Date(record.createdAt).toLocaleDateString(),
          ];
          return row.join("\t");
        })
      )
      .join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + txtContent], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `table_export_${new Date().toISOString().split("T")[0]}.txt`
    );
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = (format: "csv" | "txt") => {
    window.location.href = `/api/tables/${tableId}/export?format=${format}`;
  };

  const getWinningLegendColor = (recordData: any) => {
    // Check ALL enabled legend views
    const legendViews =
      views?.filter(
        (v) =>
          v.isEnabled &&
          v.config?.type === "legend" &&
          v.config?.legendField &&
          v.config?.colorMappings
      ) || [];

    const matches: Array<{ color: string; priority: number }> = [];

    // Collect all matching colors from all legend views
    for (const legendView of legendViews) {
      const { legendField, colorMappings } = legendView.config;
      const fieldValue = recordData?.[legendField];

      // Handle both single values and arrays (for multi-select)
      const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

      for (const value of values) {
        const mapping = colorMappings[String(value)];
        if (mapping?.color) {
          matches.push({
            color: mapping.color,
            priority: mapping.priority || 0,
          });
        }
      }
    }

    if (matches.length === 0) return null;

    // Sort by priority (descending)
    matches.sort((a, b) => b.priority - a.priority);

    // Return the color with the highest priority
    return matches[0].color;
  };

  const getRowColorClass = (recordData: any) => {
    // If we have a winning legend color, return empty string (style will handle it)
    if (getWinningLegendColor(recordData)) {
      return "";
    }

    // Fallback to original hard-coded logic
    // Digital Marketing Table Logic
    // 1. Check for boolean "Active" field being false (Inactive) - Highest Priority
    if (
      activeBooleanFieldName &&
      recordData?.[activeBooleanFieldName] === false
    ) {
      return "bg-red-100 hover:bg-red-200";
    }

    const values = Object.values(recordData || {});
    const stringValues = values.map((v) => String(v).trim());

    if (stringValues.some((v) => v.includes("לא פעיל")))
      return "bg-red-100 hover:bg-red-200";
    if (stringValues.some((v) => v.includes("ריטיינר")))
      return "bg-green-100 hover:bg-green-200";
    if (stringValues.some((v) => v.includes("תשלום חד פעמי")))
      return "bg-yellow-100 hover:bg-yellow-200";

    // Leads Table Logic
    const status = statusFieldName ? recordData?.[statusFieldName] : null;
    if (!status) return "bg-white hover:bg-gray-50";
    switch (status) {
      case "לא רלוונטי":
        return "bg-red-100 hover:bg-red-200";
      case "ליד רגיל":
        return "bg-white hover:bg-gray-50";
      case "ליד קר":
        return "bg-yellow-100 hover:bg-yellow-200";
      case "ליד חם":
        return "bg-green-100 hover:bg-green-200";
      case "ליד שנסגר":
        return "bg-blue-100 hover:bg-blue-200";
      case "ליד שלא נסגר":
        return "bg-orange-100 hover:bg-orange-200";
      default:
        return "bg-white hover:bg-gray-50";
    }
  };

  const getRowStyle = (recordData: any): React.CSSProperties | undefined => {
    const color = getWinningLegendColor(recordData);
    if (color) {
      return {
        backgroundColor: `${color}33`, // 33 = ~20% opacity
      };
    }
    return undefined;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 w-full space-y-4">
        {/* Advanced Search Component */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <AdvancedSearch
            tableId={tableId}
            schema={schema}
            onRecordSelect={handleRecordSelect}
          />
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50">
            <div className="flex gap-4 items-center w-full md:w-auto">
              <div className="text-sm text-black whitespace-nowrap">
                {selectedIds.length} selected
              </div>
              {/* Dynamic Filters for all select/multi-select fields */}
              {filterableFields.map((field) => {
                // Get unique options for this field from the records
                const uniqueOptions = Array.from(
                  new Set(
                    records
                      .map((r) => r.data?.[field.name])
                      .filter(Boolean)
                      .flatMap((val) =>
                        // Handle both array values (multi-select) and single values (select)
                        Array.isArray(val) ? val : [val]
                      )
                  )
                ).sort();

                return (
                  <select
                    key={field.name}
                    value={filters[field.name] || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-black"
                  >
                    <option value="">כל {field.label}</option>
                    {(field.options || uniqueOptions).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                );
              })}
            </div>

            {/* actions */}
            {selectedIds.length > 0 ? (
              <div className="flex gap-2">
                <div className="relative group">
                  <button className="bg-white border border-gray-300 text-black px-3 py-1 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                    Export Selected ▼
                  </button>
                  <div className="hidden group-hover:block absolute end-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[150px]">
                    <button
                      onClick={handleExportCSV}
                      className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={handleExportTXT}
                      className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50"
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
            ) : (
              <div className="relative group">
                <button className="bg-white border border-gray-300 text-black px-3 py-1 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                  Export All ▼
                </button>
                <div className="hidden group-hover:block absolute end-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[150px]">
                  <button
                    onClick={() => handleExportAll("csv")}
                    className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExportAll("txt")}
                    className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-50"
                  >
                    Export as TXT
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-gray-50 text-black font-medium border-b border-gray-100">
                <tr>
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredRecords.length > 0 &&
                        selectedIds.length === filteredRecords.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="p-4 w-10"></th>
                  <th className="p-4">ID</th>
                  {uniqueFields.map((field) => (
                    <th
                      key={field.name}
                      className={`p-4 whitespace-nowrap ${
                        ["tags", "multi-select"].includes(field.type)
                          ? "min-w-[200px]"
                          : "min-w-[150px]"
                      }`}
                    >
                      {field.label}
                    </th>
                  ))}
                  <th className="p-4 whitespace-nowrap">Created At</th>
                  <th className="p-4 whitespace-nowrap">Updated At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    ref={(el) => {
                      if (el) recordRefs.current[record.id] = el;
                    }}
                    className={`${getRowColorClass(
                      record.data
                    )} transition border-b border-gray-100 ${
                      highlightedRecordId === record.id
                        ? "ring-4 ring-blue-400 ring-opacity-75"
                        : ""
                    }`}
                    style={getRowStyle(record.data)}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => setEditingRecord(record)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                        title="Edit Record"
                      >
                        ✏️
                      </button>
                    </td>
                    <td className="p-4 text-black">#{record.id}</td>

                    {uniqueFields.map((field) => (
                      <td key={field.name} className="p-4 text-black align-top">
                        <div className="max-h-[100px] max-w-[200px] overflow-y-auto custom-scrollbar">
                          {(() => {
                            const val = record.data?.[field.name];
                            if (val === null || val === undefined || val === "")
                              return "-";

                            switch (field.type) {
                              case "boolean":
                                return val ? "Yes" : "No";
                              case "textarea":
                              case "text":
                              case "url":
                                if (field.type === "url") {
                                  return (
                                    <a
                                      href={val}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-600 hover:underline break-all block"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {val}
                                    </a>
                                  );
                                }
                                return (
                                  <div
                                    className="break-words whitespace-pre-wrap cursor-pointer hover:bg-gray-100 p-1 rounded"
                                    title="Click to view full text"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewText({
                                        title: field.label,
                                        text: String(val),
                                      });
                                    }}
                                  >
                                    {String(val).length > 60
                                      ? String(val).slice(0, 60) + "..."
                                      : String(val)}
                                  </div>
                                );
                              case "tags":
                              case "multi-select":
                                let displayVal: any = val;
                                if (
                                  typeof val === "string" &&
                                  val.startsWith("[")
                                ) {
                                  try {
                                    displayVal = JSON.parse(val);
                                  } catch (e) {
                                    // ignore parsing error
                                  }
                                }
                                if (Array.isArray(displayVal)) {
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {displayVal.map(
                                        (v: string, i: number) => (
                                          <span
                                            key={i}
                                            className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs border border-gray-200"
                                          >
                                            {v}
                                          </span>
                                        )
                                      )}
                                    </div>
                                  );
                                }
                                return String(val);
                              case "date":
                                return new Date(val).toLocaleDateString();
                              case "relation":
                                const relatedTableId = field.relationTableId;
                                const tableData =
                                  relatedTableId && relatedData[relatedTableId];
                                const displayField = field.displayField;

                                const getLabel = (id: number) => {
                                  if (!tableData || !tableData[id])
                                    return `#${id}`;
                                  const r = tableData[id];
                                  if (displayField && r.data[displayField]) {
                                    return String(r.data[displayField]);
                                  }
                                  return (
                                    String(Object.values(r.data)[0]) || `#${id}`
                                  );
                                };

                                if (Array.isArray(val)) {
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {val.map((id: any) => (
                                        <button
                                          key={id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (relatedTableId) {
                                              router.push(
                                                `/tables/${relatedTableId}`
                                              );
                                            }
                                          }}
                                          className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100 font-medium hover:bg-blue-100 hover:border-blue-200 transition text-left"
                                        >
                                          {getLabel(id)}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                }
                                return (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (relatedTableId) {
                                        router.push(
                                          `/tables/${relatedTableId}`
                                        );
                                      }
                                    }}
                                    className="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded text-xs border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition text-left"
                                  >
                                    {getLabel(val)}
                                  </button>
                                );
                              default:
                                return (
                                  <div className="break-words whitespace-pre-wrap">
                                    {String(val)}
                                  </div>
                                );
                            }
                          })()}
                        </div>
                      </td>
                    ))}

                    <td className="p-4 text-black">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-4 text-black">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {filteredRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={uniqueFields.length + 5}
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

          {viewText && (
            <ViewTextModal
              title={viewText.title}
              text={viewText.text}
              onClose={() => setViewText(null)}
            />
          )}
        </div>
      </div>

      {/* Dynamic Views Panel - replaces all hardcoded views */}
      {slug && (
        <ViewsPanel
          tableId={tableId}
          tableSlug={slug}
          schema={schema}
          records={records}
          views={views || []}
        />
      )}
    </div>
  );
}
