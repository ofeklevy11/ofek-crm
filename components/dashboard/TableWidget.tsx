"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  X,
  Table as TableIcon,
  Loader2,
  Eye,
  EyeOff,
  Settings,
} from "lucide-react";
import DynamicViewRenderer from "@/components/DynamicViewRenderer";
import { useState, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";

interface TableWidgetProps {
  id: string; // DND id
  title: string;
  tableName: string;
  data: any; // ProcessedViewData
  onRemove: (id: string) => void;
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  settings?: any;
  onSettingsChange?: (id: string, newSettings: any) => void;
}

function TableWidget({
  id,
  title,
  tableName,
  data,
  onRemove,
  isLoading,
  onEdit,
  settings,
  onSettingsChange,
}: TableWidgetProps) {
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

  const [isCollapsed, setIsCollapsed] = useState(settings?.collapsed || false);

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
      router.refresh();
    } catch (err) {
      console.error("Failed to update collapsed state", err);
      // Revert on failure
      setIsCollapsed(!newCollapsed);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between border border-indigo-100 bg-linear-to-br from-indigo-50/80 via-white to-blue-50/80 group overflow-hidden cursor-grab active:cursor-grabbing ${
        isCollapsed ? "h-auto" : "aspect-square h-full"
      }`}
    >
      {/* Decorative Circles Background for entire widget */}
      {!isCollapsed && (
        <>
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/40 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-100/40 rounded-full -ml-12 -mb-12 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </>
      )}

      <div
        className={`flex justify-between items-start relative z-10 ${
          isCollapsed ? "" : "mb-4"
        }`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
              תצוגת טבלה
            </span>
          </div>
          <h3
            className={`text-lg font-semibold text-gray-900 line-clamp-2 ${
              isCollapsed ? "" : "min-h-14"
            }`}
            title={title}
          >
            {title}
          </h3>
          <p className="text-sm text-gray-500 truncate">{tableName}</p>
        </div>
        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {/* Hide / Show Toggle */}
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggleCollapse}
            title={isCollapsed ? "הצג" : "הסתר"}
          >
            {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Settings Button */}
          {onEdit && (
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(id);
              }}
              title="הגדרות"
            >
              <Settings size={16} />
            </button>
          )}

          <button
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-black/5 rounded-full transition-colors"
            onPointerDown={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            title="הסר מהדאשבורד"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex-1 flex flex-col justify-center items-center w-full min-h-0 cursor-grab active:cursor-grabbing">
          {isLoading ? (
            <Loader2 className="animate-spin text-blue-500" size={32} />
          ) : data ? (
            <div className="w-full h-full flex items-center justify-center transform scale-90 origin-center pointer-events-none">
              {/* Pointer events none to allow dragging without interacting with chart */}
              <DynamicViewRenderer viewData={data} />
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <TableIcon size={32} className="mx-auto mb-2 opacity-50" />
              <p>שגיאה בטעינת נתונים</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(TableWidget);
