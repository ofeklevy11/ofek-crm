"use client";

import { useState, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  X,
  Table as TableIcon,
  Loader2,
  Filter,
  EyeOff,
  Eye,
  Plus,
  Settings,
  ArrowDownUp,
  Calendar,
  Hash,
  GripVertical,
} from "lucide-react";
import DynamicViewRenderer from "@/components/DynamicViewRenderer";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { useRouter } from "next/navigation";

interface CustomTableWidgetProps {
  id: string; // DND id
  title: string;
  tableName: string;
  data: any; // ProcessedViewData
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  isLoading?: boolean;
  onSettingsChange?: (id: string, newSettings: any) => void;
  settings?: any;
  tableId?: number;
}

function CustomTableWidget({
  id,
  title,
  tableName,
  data,
  onRemove,
  onEdit,
  isLoading,
  onSettingsChange,
  settings,
  tableId: propTableId,
}: CustomTableWidgetProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  // Extract table info
  const tableSlug = data?.data?.tableSlug;
  const tableId = propTableId || data?.data?.tableId;
  const tableSchema = data?.data?.schema || data?.data?.columns || [];
  const currentSort =
    data?.data?.currentSort ||
    (settings?.sortBy
      ? {
          field: settings.sortBy,
          direction: settings.sort || "desc",
        }
      : {
          field: "createdAt",
          direction: "desc",
        });

  // State for toggling visibility - initialize from settings
  const [isCollapsed, setIsCollapsed] = useState(settings?.collapsed || false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Identify numeric columns for sorting
  const numericColumns = tableSchema.filter((f: any) =>
    ["number", "rating", "score", "Rating", "Score"].includes(f.type),
  );

  const handleToggleCollapse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);

    try {
      const newSettings = {
        ...(settings || {}),
        collapsed: newCollapsed,
      };

      await updateDashboardWidgetSettings(id, newSettings);

      if (onSettingsChange) {
        onSettingsChange(id, newSettings);
      }
    } catch (err) {
      console.error("Failed to update collapsed state", err);
      // Revert on failure
      setIsCollapsed(!newCollapsed);
    }
  };

  const handleSortChange = async (field: string, direction: "asc" | "desc") => {
    setIsUpdating(true);
    try {
      const currentColumns =
        data?.data?.columns?.map((c: any) => c.name) || settings?.columns || [];

      const newSettings = {
        ...(settings || {}), // Preserve other settings like collapsed
        columns: currentColumns,
        limit: 10,
        sortBy: field,
        sort: direction,
      };

      await updateDashboardWidgetSettings(id, newSettings);

      // Notify parent to update local state and re-fetch
      if (onSettingsChange) {
        onSettingsChange(id, newSettings);
      }

      router.refresh();
    } catch (e) {
      console.error("Failed to update sort", e);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between bg-white border border-gray-100 group overflow-hidden ${
        isCollapsed ? "h-auto min-h-0" : "h-full min-h-[400px]"
      } p-6`}
      dir="rtl"
    >
      {/* Header Section */}
      <div
        className={`flex justify-between items-center border-gray-100 bg-white sticky top-0 z-20 ${isCollapsed ? "" : "mb-4 border-b pb-4"}`}
      >
        <div className="flex items-start gap-1">
          <button
            {...attributes}
            {...listeners}
            className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 rounded touch-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
            aria-label={`גרור ווידג׳ט: ${title}`}
            aria-roledescription="פריט ניתן לגרירה"
          >
            <GripVertical size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
            <TableIcon size={18} />
          </div>
          <div>
            <h3
              className="text-lg font-bold text-gray-900 leading-tight"
              title={title}
            >
              {title}
            </h3>
            <p className="text-xs text-gray-500">{tableName}</p>
            {tableId && (
              <div className="flex items-center gap-1 mt-1">
                <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-medium border border-indigo-100">
                  <ArrowDownUp size={10} />
                  <span className="truncate max-w-[150px]">
                    {(() => {
                      const field = currentSort.field;
                      const dir = currentSort.direction;
                      let label = field;

                      if (field === "createdAt") label = "תאריך יצירה";
                      else {
                        const col = tableSchema.find(
                          (f: any) => f.name === field,
                        );
                        if (col) label = col.label;
                      }

                      let dirLabel = dir === "desc" ? "יורד" : "עולה";
                      if (field === "createdAt") {
                        dirLabel = dir === "desc" ? "חדש" : "ישן";
                      } else if (
                        [
                          "number",
                          "rating",
                          "score",
                          "Rating",
                          "Score",
                        ].includes(
                          tableSchema.find((f: any) => f.name === field)?.type,
                        )
                      ) {
                        dirLabel = dir === "desc" ? "גבוה" : "נמוך";
                      }

                      return `${label}: ${dirLabel}`;
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {tableId && (
            <>
              <div className="hidden sm:flex items-center gap-1 ml-4 bg-gray-50 p-1 rounded-lg border border-gray-100">
                {/* Filter / Sort Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`p-1.5 hover:bg-white rounded-md transition shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${isUpdating ? "animate-spin text-blue-500" : "text-gray-400 hover:text-gray-600"}`}
                      aria-label="סינון ומיון"
                      title="סינון ומיון"
                    >
                      <Filter size={14} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 p-2"
                    align="end"
                  >
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-2">
                      מיון לפי
                    </div>
                    <div className="space-y-1">
                      <button
                        onClick={() => handleSortChange("createdAt", "desc")}
                        className={`w-full text-right px-2 py-1.5 text-sm rounded-md flex items-center justify-between ${currentSort.field === "createdAt" && currentSort.direction === "desc" ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
                      >
                        <span className="flex items-center gap-2">
                          <Calendar size={13} /> תאריך יצירה (חדש)
                        </span>
                        {currentSort.field === "createdAt" &&
                          currentSort.direction === "desc" && (
                            <ArrowDownUp size={12} />
                          )}
                      </button>
                      <button
                        onClick={() => handleSortChange("createdAt", "asc")}
                        className={`w-full text-right px-2 py-1.5 text-sm rounded-md flex items-center justify-between ${currentSort.field === "createdAt" && currentSort.direction === "asc" ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
                      >
                        <span className="flex items-center gap-2">
                          <Calendar size={13} /> תאריך יצירה (ישן)
                        </span>
                        {currentSort.field === "createdAt" &&
                          currentSort.direction === "asc" && (
                            <ArrowDownUp size={12} />
                          )}
                      </button>

                      {numericColumns.length > 0 && (
                        <div className="border-t border-gray-100 my-1"></div>
                      )}

                      {numericColumns.map((col: any) => (
                        <div key={col.name}>
                          <button
                            onClick={() => handleSortChange(col.name, "desc")}
                            className={`w-full text-right px-2 py-1.5 text-sm rounded-md flex items-center justify-between ${currentSort.field === col.name && currentSort.direction === "desc" ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
                          >
                            <span className="flex items-center gap-2 truncate max-w-[130px]">
                              <Hash size={13} /> {col.label} (גבוה)
                            </span>
                          </button>
                          <button
                            onClick={() => handleSortChange(col.name, "asc")}
                            className={`w-full text-right px-2 py-1.5 text-sm rounded-md flex items-center justify-between ${currentSort.field === col.name && currentSort.direction === "asc" ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
                          >
                            <span className="flex items-center gap-2 truncate max-w-[130px]">
                              <Hash size={13} /> {col.label} (נמוך)
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Hide / Show Toggle */}
                <button
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  onClick={handleToggleCollapse}
                  aria-label={isCollapsed ? "הצג תוכן ווידג׳ט" : "הסתר תוכן ווידג׳ט"}
                  title={isCollapsed ? "הצג טבלה" : "הסתר טבלה"}
                >
                  {isCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Settings Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  aria-label="הגדרות ווידג׳ט"
                  title="ערוך תצוגה"
                >
                  <Settings size={14} />
                </button>
              </div>

              <Link
                href={`/tables/${tableId}?new=true`}
                className="flex items-center gap-1 text-xs font-medium bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition shadow-sm ml-2"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">חדש</span>
              </Link>
            </>
          )}

          <button
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus-within:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            onClick={() => onRemove(id)}
            aria-label="הסר ווידג׳ט מהדאשבורד"
            title="הסר מהדאשבורד"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content Section */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col w-full min-h-0 bg-white relative">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center" role="status">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <span className="sr-only">טוען נתונים...</span>
            </div>
          ) : data ? (
            <div className="w-full h-full overflow-hidden flex flex-col">
              <DynamicViewRenderer viewData={data} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-8">
              <TableIcon size={48} className="mx-auto mb-4 opacity-20" />
              <p>שגיאה בטעינת נתונים</p>
            </div>
          )}
        </div>
      )}
      {/* Hidden view indicator removed to save space or made very subtle */}
    </div>
  );
}

export default memo(CustomTableWidget);
