"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AdvancedSearch from "./AdvancedSearch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Edit2,
  Trash2,
  Download,
  MoreVertical,
  Search,
  Check,
  FileDown,
  MoreHorizontal,
} from "lucide-react";
import EditRecordModal from "./EditRecordModal";
import ViewTextModal from "./ViewTextModal";
import { cn } from "@/lib/utils";

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
  canEdit?: boolean;
  canSearch?: boolean;
  canFilter?: boolean;
  canExport?: boolean;
}

export default function RecordTable({
  tableId,
  schema,
  initialRecords,
  slug,
  views = [],
  canEdit = false,
  canSearch = false,
  canFilter = false,
  canExport = false,
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
  const [editingField, setEditingField] = useState<string | undefined>(
    undefined
  );
  // Dynamic filters
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [viewText, setViewText] = useState<{
    title: string;
    text: string;
    record?: any;
    fieldName?: string;
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
            const res = await fetch(
              `/api/tables/${field.relationTableId}/records`
            );
            if (res.ok) {
              const data = await res.json();
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
      const timeout = setTimeout(() => {
        setHighlightedRecordId(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [highlightedRecordId]);

  const handleRecordSelect = (recordId: number) => {
    setHighlightedRecordId(recordId);
    const record = records.find((r) => r.id === recordId);
    if (record) {
      setEditingRecord(record);
      setEditingField(undefined);
    }
  };

  const uniqueFields = schema.filter(
    (field, index, self) =>
      index === self.findIndex((t) => t.name === field.name)
  );

  const statusField = schema.find(
    (f) =>
      f.name.toLowerCase() === "status" ||
      f.label === "סטטוס" ||
      f.label.toLowerCase() === "status" ||
      f.label.includes("סטטוס")
  );
  const statusFieldName = statusField?.name;

  const activeBooleanFieldName = schema.find(
    (f) =>
      f.type === "boolean" &&
      (f.name.toLowerCase().includes("active") || f.label.includes("פעיל"))
  )?.name;

  const filterableFields = schema.filter(
    (f) => f.type === "select" || f.type === "multi-select"
  );

  const filteredRecords = records.filter((record) => {
    for (const [fieldName, filterValue] of Object.entries(filters)) {
      if (!filterValue) continue;
      const recordValue = record.data?.[fieldName];
      if (Array.isArray(recordValue)) {
        if (!recordValue.includes(filterValue)) return false;
      } else {
        if (recordValue !== filterValue) return false;
      }
    }
    return true;
  });

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
    if (!confirm(`האם אתה בטוח שברצונך למחוק ${selectedIds.length} רשומות?`))
      return;
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
      alert("שגיאה במחיקת רשומות");
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
      alert("אין רשומות לייצוא");
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
      `export_${new Date().toISOString().split("T")[0]}.csv`
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
      alert("אין רשומות לייצוא");
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
      `export_${new Date().toISOString().split("T")[0]}.txt`
    );
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = (format: "csv" | "txt") => {
    window.location.href = `/api/tables/${tableId}/export?format=${format}`;
  };

  const getWinningLegendColor = (recordData: any) => {
    const legendViews =
      views?.filter(
        (v) =>
          v.isEnabled &&
          v.config?.type === "legend" &&
          v.config?.legendField &&
          v.config?.colorMappings
      ) || [];

    const matches: Array<{ color: string; priority: number }> = [];

    for (const legendView of legendViews) {
      const { legendField, colorMappings } = legendView.config;
      const fieldValue = recordData?.[legendField];
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
    matches.sort((a, b) => b.priority - a.priority);
    return matches[0].color;
  };

  const getRowColorClass = (recordData: any) => {
    if (getWinningLegendColor(recordData)) {
      return "";
    }

    if (
      activeBooleanFieldName &&
      recordData?.[activeBooleanFieldName] === false
    ) {
      return "bg-destructive/10 hover:bg-destructive/20";
    }

    const values = Object.values(recordData || {});
    const stringValues = values.map((v) => String(v).trim());

    if (stringValues.some((v) => v.includes("לא פעיל")))
      return "bg-destructive/10 hover:bg-destructive/20";
    if (stringValues.some((v) => v.includes("ריטיינר")))
      return "bg-green-100 dark:bg-green-900/30 hover:bg-green-200";
    if (stringValues.some((v) => v.includes("תשלום חד פעמי")))
      return "bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200";

    const status = statusFieldName ? recordData?.[statusFieldName] : null;
    if (!status) return ""; // Default Shadcn table row style (white/muted)
    switch (status) {
      case "לא רלוונטי":
        return "bg-destructive/10 hover:bg-destructive/20";
      case "ליד רגיל":
        return "";
      case "ליד קר":
        return "bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200";
      case "ליד חם":
        return "bg-green-100 dark:bg-green-900/30 hover:bg-green-200";
      case "ליד שנסגר":
        return "bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200";
      case "ליד שלא נסגר":
        return "bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200";
      default:
        return "";
    }
  };

  const getRowStyle = (recordData: any): React.CSSProperties | undefined => {
    const color = getWinningLegendColor(recordData);
    if (color) {
      return {
        backgroundColor: `${color}33`,
      };
    }
    return undefined;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start" dir="rtl">
      <div className="flex-1 w-full space-y-4">
        {/* Advanced Search Component */}
        {canSearch && (
          <div className="bg-card rounded-xl shadow-sm border border-border p-4">
            <AdvancedSearch
              tableId={tableId}
              schema={schema}
              onRecordSelect={handleRecordSelect}
            />
          </div>
        )}

        {/* Main Table */}
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between items-center bg-muted/20">
            <div className="flex gap-4 items-center w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              <div className="text-sm text-foreground whitespace-nowrap font-medium">
                {selectedIds.length} נבחרו
              </div>
              {/* Dynamic Filters */}
              {canFilter &&
                filterableFields.map((field) => {
                  const uniqueOptions = Array.from(
                    new Set(
                      records
                        .map((r) => r.data?.[field.name])
                        .filter(Boolean)
                        .flatMap((val) => (Array.isArray(val) ? val : [val]))
                    )
                  ).sort();

                  return (
                    <div className="relative" key={field.name}>
                      <select
                        value={filters[field.name] || ""}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        className="h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        <option value="">כל {field.label}</option>
                        {(field.options || uniqueOptions).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-gray-400">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Actions */}
            <div className="flex gap-2 items-center">
              {selectedIds.length > 0 && (
                <>
                  {canExport && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" />
                          ייצוא נבחרים
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportCSV}>
                          CSV (Excel)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportTXT}>
                          TXT (Text)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {canEdit && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={isDeleting}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? "מוחק..." : "מחק נבחרים"}
                    </Button>
                  )}
                </>
              )}
              {selectedIds.length === 0 && canExport && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileDown className="h-4 w-4" />
                      ייצוא הכל
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExportAll("csv")}>
                      CSV (Excel)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportAll("txt")}>
                      TXT (Text)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[50px] text-center">
                    <Checkbox
                      checked={
                        filteredRecords.length > 0 &&
                        selectedIds.length === filteredRecords.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[80px] text-right">#</TableHead>
                  {uniqueFields.map((field) => (
                    <TableHead
                      key={field.name}
                      className={`whitespace-nowrap text-right ${
                        ["tags", "multi-select"].includes(field.type)
                          ? "min-w-[200px]"
                          : "min-w-[150px]"
                      }`}
                    >
                      {field.label}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap text-right">
                    נוצר ב
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow
                    key={record.id}
                    ref={(el) => {
                      if (el) recordRefs.current[record.id] = el;
                    }}
                    className={cn(
                      getRowColorClass(record.data),
                      highlightedRecordId === record.id &&
                        "ring-2 ring-primary ring-inset bg-primary/5"
                    )}
                    style={getRowStyle(record.data)}
                  >
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedIds.includes(record.id)}
                        onCheckedChange={() => toggleSelect(record.id)}
                      />
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditingRecord(record);
                            setEditingField(undefined);
                          }}
                          title="ערוך רשומה"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {record.id}
                    </TableCell>

                    {uniqueFields.map((field) => (
                      <TableCell
                        key={field.name}
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingRecord(record);
                          setEditingField(field.name);
                        }}
                        className={cn(
                          "align-top text-right",
                          canEdit &&
                            "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        )}
                        title={canEdit ? "לחץ לעריכה" : ""}
                      >
                        <div className="max-h-[100px] max-w-[300px] overflow-y-auto custom-scrollbar">
                          {(() => {
                            const val = record.data?.[field.name];
                            if (val === null || val === undefined || val === "")
                              return (
                                <span className="text-muted-foreground/30">
                                  -
                                </span>
                              );

                            switch (field.type) {
                              case "boolean":
                                return val ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-green-50 text-green-700 border-green-200"
                                  >
                                    כן
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-gray-50 text-gray-600 border-gray-200"
                                  >
                                    לא
                                  </Badge>
                                );
                              case "textarea":
                              case "text":
                              case "url":
                                if (field.type === "url") {
                                  return (
                                    <a
                                      href={val}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline break-all block text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {val}
                                    </a>
                                  );
                                }
                                return (
                                  <div
                                    className="break-words whitespace-pre-wrap text-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (String(val).length > 60) {
                                        setViewText({
                                          title: field.label,
                                          text: String(val),
                                          record: record,
                                          fieldName: field.name,
                                        });
                                      } else if (canEdit) {
                                        // Propagate to cell click for edit
                                        setEditingRecord(record);
                                        setEditingField(field.name);
                                      }
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
                                          <Badge
                                            key={i}
                                            variant="secondary"
                                            className="text-xs px-2 py-0.5"
                                          >
                                            {v}
                                          </Badge>
                                        )
                                      )}
                                    </div>
                                  );
                                }
                                return String(val);
                              case "date":
                                return (
                                  <span className="text-sm font-medium">
                                    {new Date(val).toLocaleDateString("he-IL")}
                                  </span>
                                );
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
                                        <Badge
                                          key={id}
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (relatedTableId) {
                                              router.push(
                                                `/tables/${relatedTableId}`
                                              );
                                            }
                                          }}
                                          className="bg-primary/5 hover:bg-primary/10 cursor-pointer text-primary border-primary/20"
                                        >
                                          {getLabel(id)}
                                        </Badge>
                                      ))}
                                    </div>
                                  );
                                }
                                return (
                                  <Badge
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (relatedTableId) {
                                        router.push(
                                          `/tables/${relatedTableId}`
                                        );
                                      }
                                    }}
                                    className="bg-primary/5 hover:bg-primary/10 cursor-pointer text-primary border-primary/20"
                                  >
                                    {getLabel(val)}
                                  </Badge>
                                );
                              default:
                                return (
                                  <div className="break-words whitespace-pre-wrap text-sm">
                                    {String(val)}
                                  </div>
                                );
                            }
                          })()}
                        </div>
                      </TableCell>
                    ))}

                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString("he-IL")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredRecords.length === 0 && (
              <div className="p-12 text-center text-muted-foreground bg-muted/10">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>לא נמצאו רשומות התואמות את החיפוש</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {editingRecord && canEdit && (
        <EditRecordModal
          record={editingRecord}
          schema={schema}
          onClose={() => setEditingRecord(null)}
          initialFocusField={editingField}
        />
      )}

      {viewText && (
        <ViewTextModal
          title={viewText.title}
          text={viewText.text}
          isOpen={!!viewText}
          onClose={() => setViewText(null)}
          onEdit={() => {
            if (viewText.record && viewText.fieldName && canEdit) {
              setEditingRecord(viewText.record);
              setEditingField(viewText.fieldName);
              setViewText(null);
            }
          }}
        />
      )}
    </div>
  );
}
