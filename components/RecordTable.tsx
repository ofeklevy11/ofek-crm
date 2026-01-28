"use client";

import { uploadFiles } from "@/lib/uploadthing";
import { saveFileMetadata, updateFile } from "@/app/actions/storage";
import { useState, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";
import AdvancedSearch from "./AdvancedSearch";
import { applyFilters } from "@/lib/viewProcessor";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Edit2,
  Trash2,
  Download,
  MoreVertical,
  Search,
  Check,
  FileDown,
  File as FileIcon,
  MoreHorizontal,
  Paperclip,
  ExternalLink,
  Link,
  Plus,
  Pencil,
  X,
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
  min?: number;
  max?: number;
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
    undefined,
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
    null,
  );
  const recordRefs = useRef<Record<number, HTMLTableRowElement>>({});
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollWidthRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // State for link input popover
  const [linkInputRecordId, setLinkInputRecordId] = useState<number | null>(
    null,
  );
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkName, setNewLinkName] = useState("");

  // State for editing existing link
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkName, setEditLinkName] = useState("");

  // State for editing existing file
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editFileName, setEditFileName] = useState("");

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    recordId: number,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 1 * 1024 * 1024) {
      alert("גודל הקובץ חייב להיות עד 1MB");
      e.target.value = ""; // Reset input
      return;
    }

    try {
      console.log("Uploading file for record:", recordId);

      const res = await uploadFiles("companyFiles", {
        files: [file],
      });

      if (res && res.length > 0) {
        const uploaded = res[0];
        await saveFileMetadata(
          {
            name: uploaded.name,
            url: uploaded.url,
            key: uploaded.key,
            size: uploaded.size,
            type: file.type || "unknown",
          },
          null, // No folder (root)
          recordId,
        );
        router.refresh();
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      alert("שגיאה בהעלאת הקובץ: " + error.message);
    } finally {
      e.target.value = ""; // Reset input
    }
  };

  const handleAddLink = async (recordId: number) => {
    if (!newLinkUrl.trim()) return;

    let finalUrl = newLinkUrl.trim();
    // Add protocol if missing
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    // Extract filename from URL
    let filename = finalUrl.replace(/^https?:\/\//i, "");
    if (filename.includes("/")) {
      filename = filename.split("/").pop() || filename;
    }
    if (!filename || filename.length === 0) filename = "link";

    try {
      const res = await fetch(`/api/records/${recordId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: finalUrl,
          filename: filename,
          displayName: newLinkName.trim() || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to add link");

      const newAttachment = await res.json();

      // Update local state
      setRecords((prevRecords) =>
        prevRecords.map((r) => {
          if (r.id === recordId) {
            return {
              ...r,
              attachments: [...(r.attachments || []), newAttachment],
            };
          }
          return r;
        }),
      );

      setNewLinkUrl("");
      setNewLinkName("");
      setLinkInputRecordId(null);
    } catch (error) {
      console.error(error);
      alert("שגיאה בהוספת הלינק");
    }
  };

  const handleUpdateLink = async (recordId: number, attachmentId: number) => {
    if (!editLinkUrl.trim()) return;

    let finalUrl = editLinkUrl.trim();
    // Add protocol if missing
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: finalUrl,
          displayName: editLinkName.trim() || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update link");

      const updatedAttachment = await res.json();

      // Update local state
      setRecords((prevRecords) =>
        prevRecords.map((r) => {
          if (r.id === recordId) {
            return {
              ...r,
              attachments: r.attachments.map((a: any) =>
                a.id === attachmentId ? updatedAttachment : a,
              ),
            };
          }
          return r;
        }),
      );

      setEditingLinkId(null);
      setEditLinkUrl("");
      setEditLinkName("");
    } catch (error) {
      console.error(error);
      alert("שגיאה בעדכון הלינק");
    }
  };

  const handleUpdateFile = async (recordId: number, fileId: number) => {
    try {
      await updateFile(fileId, { displayName: editFileName.trim() || null });

      // Update local state
      setRecords((prevRecords) =>
        prevRecords.map((r) => {
          if (r.id === recordId) {
            return {
              ...r,
              files: r.files?.map((f: any) =>
                f.id === fileId
                  ? { ...f, displayName: editFileName.trim() || null }
                  : f,
              ),
            };
          }
          return r;
        }),
      );

      setEditingFileId(null);
      setEditFileName("");
    } catch (error) {
      console.error(error);
      alert("שגיאה בעדכון שם הקובץ");
    }
  };

  // Fetch related data
  useEffect(() => {
    const fetchRelatedData = async () => {
      const relationFields = schema.filter(
        (f) => f.type === "relation" && f.relationTableId,
      );
      const newRelatedData: Record<string, any> = {};

      await Promise.all(
        relationFields.map(async (field) => {
          if (!field.relationTableId) return;
          try {
            const res = await fetch(
              `/api/tables/${field.relationTableId}/records`,
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
              error,
            );
          }
        }),
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
      index === self.findIndex((t) => t.name === field.name),
  );

  const statusField = schema.find(
    (f) =>
      f.name.toLowerCase() === "status" ||
      f.label === "סטטוס" ||
      f.label.toLowerCase() === "status" ||
      f.label.includes("סטטוס"),
  );
  const statusFieldName = statusField?.name;

  const activeBooleanFieldName = schema.find(
    (f) =>
      f.type === "boolean" &&
      (f.name.toLowerCase().includes("active") || f.label.includes("פעיל")),
  )?.name;

  const filterableFields = schema.filter(
    (f) => f.type === "select" || f.type === "multi-select",
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

  // Ensure strict order by createdAt (descending - stack order) with ID tie-breaker
  // This prevents records from moving when updated, as they revert to physical order without explicit sort
  filteredRecords.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.id - a.id;
  });

  // Sync top scrollbar width with table width
  useEffect(() => {
    const updateScrollWidth = () => {
      if (tableScrollRef.current && scrollWidthRef.current) {
        const tableWidth = tableScrollRef.current.scrollWidth;
        scrollWidthRef.current.style.width = `${tableWidth}px`;
      }
    };

    updateScrollWidth();

    // Use ResizeObserver to detect table size changes
    const resizeObserver = new ResizeObserver(updateScrollWidth);
    if (tableScrollRef.current) {
      resizeObserver.observe(tableScrollRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [records, schema]);

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

  const handleDeleteAttachment = async (
    e: React.MouseEvent,
    recordId: number,
    attachmentId: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("האם למחוק לינק זה?")) return;

    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete attachment");

      setRecords((prevRecords) =>
        prevRecords.map((r) => {
          if (r.id === recordId) {
            return {
              ...r,
              attachments: r.attachments.filter(
                (a: any) => a.id !== attachmentId,
              ),
            };
          }
          return r;
        }),
      );
    } catch (error) {
      console.error(error);
      alert("שגיאה במחיקת לינק");
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

    const headers = [
      "ID",
      ...uniqueFields.map((f) => f.label),
      "Created At",
      "Updated At",
    ];
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
            new Date(record.updatedAt).toLocaleDateString(),
          ];
          return row.join(";");
        }),
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
      `export_${new Date().toISOString().split("T")[0]}.csv`,
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

    const headers = [
      "ID",
      ...uniqueFields.map((f) => f.label),
      "Created At",
      "Updated At",
    ];
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
            new Date(record.updatedAt).toLocaleDateString(),
          ];
          return row.join("\t");
        }),
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
      `export_${new Date().toISOString().split("T")[0]}.txt`,
    );
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = (format: "csv" | "txt") => {
    window.location.href = `/api/tables/${tableId}/export?format=${format}`;
  };

  const getWinningLegendColor = (record: any) => {
    const legendViews =
      views?.filter(
        (v) =>
          v.isEnabled &&
          v.config?.type === "legend" &&
          v.config?.legendField &&
          v.config?.colorMappings,
      ) || [];

    const matches: Array<{ color: string; priority: number }> = [];

    for (const legendView of legendViews) {
      // Check if record matches view filters
      const { filters, dateFilter } = legendView.config;
      if ((filters && filters.length > 0) || dateFilter) {
        // Construct a record object compatible with applyFilters
        // applyFilters expects { data, createdAt, ... }
        // The 'record' passed here is the full record object from state
        const filtered = applyFilters([record], filters || [], dateFilter);
        if (filtered.length === 0) continue;
      }

      const { legendField, colorMappings } = legendView.config;
      const fieldValue = record.data?.[legendField];
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

  const getRowColorClass = (record: any) => {
    return "";
  };

  const getRowStyle = (record: any): React.CSSProperties | undefined => {
    const color = getWinningLegendColor(record);
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
                        .flatMap((val) => (Array.isArray(val) ? val : [val])),
                    ),
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

          <div
            className="overflow-x-auto scrollbar-top"
            ref={topScrollRef}
            onScroll={() => {
              if (tableScrollRef.current && topScrollRef.current) {
                tableScrollRef.current.scrollLeft =
                  topScrollRef.current.scrollLeft;
              }
            }}
          >
            <div style={{ height: "12px" }} ref={scrollWidthRef} />
          </div>
          <div
            className="overflow-x-auto scrollbar-hide"
            ref={tableScrollRef}
            onScroll={() => {
              if (topScrollRef.current && tableScrollRef.current) {
                topScrollRef.current.scrollLeft =
                  tableScrollRef.current.scrollLeft;
              }
            }}
          >
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
                      className="border-gray-400 bg-white mr-4"
                    />
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[80px] text-center">ID</TableHead>
                  {uniqueFields.map((field) => (
                    <TableHead
                      key={field.name}
                      className={`whitespace-nowrap text-center ${
                        ["tags", "multi-select"].includes(field.type)
                          ? "min-w-[200px]"
                          : "min-w-[150px]"
                      }`}
                    >
                      {field.label}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap text-center">
                    קבצים ולינקים
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center">
                    נוצר ב
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center">
                    עודכן בתאריך
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
                      getRowColorClass(record),
                      highlightedRecordId === record.id &&
                        "ring-2 ring-primary ring-inset bg-primary/5",
                    )}
                    style={getRowStyle(record)}
                  >
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedIds.includes(record.id)}
                        onCheckedChange={() => toggleSelect(record.id)}
                        className="border-gray-400 bg-white mr-4"
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
                    <TableCell className="font-mono text-xs text-muted-foreground text-center">
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
                          "align-middle text-center",
                          canEdit &&
                            "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors",
                        )}
                        title={canEdit ? "לחץ לעריכה" : ""}
                      >
                        <div className="max-h-[100px] max-w-[300px] overflow-y-auto custom-scrollbar mx-auto">
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
                                        ),
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
                                                `/tables/${relatedTableId}`,
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
                                          `/tables/${relatedTableId}`,
                                        );
                                      }
                                    }}
                                    className="bg-primary/5 hover:bg-primary/10 cursor-pointer text-primary border-primary/20"
                                  >
                                    {getLabel(val)}
                                  </Badge>
                                );

                              case "score":
                                const scoreVal = Number(val);
                                const min = field.min || 0;
                                const max = field.max || 10;
                                if (isNaN(scoreVal))
                                  return (
                                    <span className="text-muted-foreground">
                                      -
                                    </span>
                                  );

                                const percentage =
                                  max === 0
                                    ? 0
                                    : Math.min(
                                        Math.max((scoreVal / max) * 100, 0),
                                        100,
                                      );

                                let colorClass = "bg-red-500";
                                if (percentage >= 66)
                                  colorClass = "bg-green-500";
                                else if (percentage >= 33)
                                  colorClass = "bg-orange-500";

                                return (
                                  <div className="w-full flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${colorClass}`}
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-mono w-8 text-left">
                                      {scoreVal}
                                    </span>
                                  </div>
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

                    <TableCell className="text-center align-middle">
                      <div className="flex flex-col gap-1 items-center justify-center min-w-[150px]">
                        {/* Legacy Attachments */}
                        {record.attachments?.map((att: any) => (
                          <div
                            key={`att-${att.id}`}
                            className="flex flex-col gap-1 text-xs bg-muted px-2 py-1 rounded-md max-w-[200px] w-full group"
                          >
                            {editingLinkId === att.id ? (
                              // Edit mode
                              <div
                                className="flex flex-col gap-1 w-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  placeholder="שם הלינק (אופציונלי)"
                                  value={editLinkName}
                                  onChange={(e) =>
                                    setEditLinkName(e.target.value)
                                  }
                                  className="h-6 text-[10px] w-full"
                                />
                                <Input
                                  placeholder="כתובת URL"
                                  value={editLinkUrl}
                                  onChange={(e) =>
                                    setEditLinkUrl(e.target.value)
                                  }
                                  className="h-6 text-[10px] w-full"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleUpdateLink(record.id, att.id);
                                    }
                                    if (e.key === "Escape") {
                                      setEditingLinkId(null);
                                      setEditLinkUrl("");
                                      setEditLinkName("");
                                    }
                                  }}
                                />
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 px-1 text-[10px]"
                                    onClick={() => {
                                      setEditingLinkId(null);
                                      setEditLinkUrl("");
                                      setEditLinkName("");
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-5 px-2 text-[10px]"
                                    onClick={() =>
                                      handleUpdateLink(record.id, att.id)
                                    }
                                    disabled={!editLinkUrl.trim()}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              // Display mode
                              <div className="flex items-center justify-between w-full">
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 truncate hover:underline text-blue-600 flex-1 min-w-0"
                                  title={att.url}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {att.displayName || att.filename}
                                  </span>
                                </a>
                                {canEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-primary/10 hover:text-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingLinkId(att.id);
                                        setEditLinkUrl(att.url);
                                        setEditLinkName(att.displayName || "");
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive"
                                      onClick={(e) =>
                                        handleDeleteAttachment(
                                          e,
                                          record.id,
                                          att.id,
                                        )
                                      }
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* New Files */}
                        {record.files?.map((file: any) => (
                          <div
                            key={`file-${file.id}`}
                            className="flex flex-col gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md max-w-[200px] w-full"
                          >
                            {editingFileId === file.id ? (
                              // Edit Mode
                              <div
                                className="flex flex-col gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  placeholder={file.name}
                                  value={editFileName}
                                  onChange={(e) =>
                                    setEditFileName(e.target.value)
                                  }
                                  className="h-6 text-[10px]"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleUpdateFile(record.id, file.id);
                                    if (e.key === "Escape") {
                                      setEditingFileId(null);
                                      setEditFileName("");
                                    }
                                  }}
                                />
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 px-1 text-[10px]"
                                    onClick={() => {
                                      setEditingFileId(null);
                                      setEditFileName("");
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-5 px-2 text-[10px]"
                                    onClick={() =>
                                      handleUpdateFile(record.id, file.id)
                                    }
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              // Normal Mode
                              <div className="flex items-center justify-between group">
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 truncate hover:underline text-blue-600 dark:text-blue-400 flex-1"
                                  title={file.url}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileIcon className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {file.displayName || file.name}
                                  </span>
                                </a>
                                {canEdit && (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-blue-200 dark:hover:bg-blue-800"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditFileName(file.displayName || "");
                                        setEditingFileId(file.id);
                                      }}
                                      title="ערוך שם"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Upload Button */}
                        {canEdit && (
                          <div className="mt-1 w-full flex flex-col gap-1">
                            <input
                              type="file"
                              id={`file-upload-${record.id}`}
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, record.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <label
                              htmlFor={`file-upload-${record.id}`}
                              className="cursor-pointer inline-flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors border border-dashed border-muted-foreground/30 px-2 py-1 rounded-sm w-full hover:bg-muted/50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Paperclip className="h-3 w-3" />
                              <span>העלה קובץ (עד 1MB)</span>
                            </label>

                            {/* Add Link Button/Input */}
                            {linkInputRecordId === record.id ? (
                              <div
                                className="flex flex-col gap-1 w-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  placeholder="שם הלינק (אופציונלי)"
                                  value={newLinkName}
                                  onChange={(e) =>
                                    setNewLinkName(e.target.value)
                                  }
                                  className="h-7 text-[10px] w-full"
                                />
                                <div className="flex gap-1 items-center w-full">
                                  <Input
                                    placeholder="הדבק לינק..."
                                    value={newLinkUrl}
                                    onChange={(e) =>
                                      setNewLinkUrl(e.target.value)
                                    }
                                    className="h-7 text-[10px] flex-1 min-w-0"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddLink(record.id);
                                      }
                                      if (e.key === "Escape") {
                                        setLinkInputRecordId(null);
                                        setNewLinkUrl("");
                                        setNewLinkName("");
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-1"
                                    onClick={() => {
                                      setLinkInputRecordId(null);
                                      setNewLinkUrl("");
                                      setNewLinkName("");
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() => handleAddLink(record.id)}
                                    disabled={!newLinkUrl.trim()}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors border border-dashed border-muted-foreground/30 px-2 py-1 rounded-sm w-full hover:bg-muted/50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLinkInputRecordId(record.id);
                                  setNewLinkUrl("");
                                  setNewLinkName("");
                                }}
                              >
                                <Link className="h-3 w-3" />
                                <span>הוסף לינק</span>
                              </button>
                            )}
                          </div>
                        )}

                        {!record.attachments?.length &&
                          !record.files?.length &&
                          !canEdit && (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap text-center">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString("he-IL")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap text-center">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleDateString("he-IL")
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
