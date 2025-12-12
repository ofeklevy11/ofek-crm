"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAnalyticsData } from "@/app/actions/analytics";
import { getCurrentAuthUser } from "@/app/actions/auth";
import {
  Loader2,
  List,
  Plus,
  Palette,
  Edit3,
  Settings,
  Zap,
  Sparkles,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import AnalyticsDetailsModal from "@/components/AnalyticsDetailsModal";
import CreateAnalyticsViewModal from "@/components/analytics/CreateAnalyticsViewModal";
import ViewAutomationModal from "@/components/analytics/ViewAutomationModal";
import AIAnalyticsCreator from "@/components/analytics/AIAnalyticsCreator";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateAnalyticsViewOrder,
  updateAnalyticsViewColor,
} from "@/app/actions/analytics";
import {
  createViewFolder,
  getViewFolders,
  deleteViewFolder,
  moveViewToFolder,
} from "@/app/actions/view-folders";
import { deleteAnalyticsView } from "@/app/actions/analytics";
import { Folder, FolderPlus, ArrowLeft, Move, X, Trash2 } from "lucide-react";
import { hasUserFlag } from "@/lib/permissions";

// Available colors for the cards
const COLOR_OPTIONS = [
  { label: "לבן", value: "bg-white", border: "border-gray-100" },
  { label: "אדום", value: "bg-red-50", border: "border-red-100" },
  { label: "צהוב", value: "bg-yellow-50", border: "border-yellow-100" },
  { label: "ירוק", value: "bg-green-50", border: "border-green-100" },
  { label: "כחול", value: "bg-blue-50", border: "border-blue-100" },
  { label: "סגול", value: "bg-purple-50", border: "border-purple-100" },
  { label: "ורוד", value: "bg-pink-50", border: "border-pink-100" },
];

const KEY_MAPPING: Record<string, string> = {
  status: "סטטוס",
  priority: "עדיפות",
  assignee: "נציג מטפל",
  tags: "תגיות",
  amount: "סכום",
  title: "כותרת",
  description: "תיאור",
  client: "לקוח",
  phone: "טלפון",
  email: "מייל",
  relatedType: "סוג קשור",
  frequency: "תדירות",
  startDate: "תאריך התחלה",
  dueDate: "תאריך יעד",
  createdAt: "נוצר ב",
  updatedAt: "עודכן ב",
  // Common Values translation
  todo: "לביצוע",
  in_progress: "בטיפול",
  waiting_client: "ממתין",
  completed_month: "הושלם",
  archive: "ארכיון",
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  active: "פעיל",
  paused: "מושהה",
  cancelled: "מבוטל",
  paid: "שולם",
  pending: "ממתין",
  overdue: "באיחור",
  completed: "הושלם",
  failed: "נכשל",
  this_week: "השבוע (א'-ש')",
  last_30_days: "30 ימים אחרונים",
  last_year: "שנה אחרונה",
};

const translate = (key: string) => KEY_MAPPING[key] || key;

function ConfigDetails({ config, type }: { config: any; type: string }) {
  if (!config) return null;

  const renderFilter = (filter: any, label?: string) => {
    if (!filter || Object.keys(filter).length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 items-center bg-white/50 rounded-md px-2 py-1 border border-black/5">
        {label && <span className="text-gray-500 text-xs ml-1">{label}:</span>}
        {Object.entries(filter).map(([key, val]) => (
          <span
            key={key}
            className="text-gray-700 text-xs font-medium bg-white border border-gray-200 px-1.5 rounded"
          >
            {translate(key)}: {translate(String(val))}
          </span>
        ))}
      </div>
    );
  };

  const renderDateRange = () => {
    if (!config.dateRangeType || config.dateRangeType === "all") return null;

    let text = translate(config.dateRangeType);
    if (config.dateRangeType === "custom") {
      const start = config.customStartDate
        ? new Date(config.customStartDate).toLocaleDateString("he-IL")
        : "";
      const end = config.customEndDate
        ? new Date(config.customEndDate).toLocaleDateString("he-IL")
        : "";
      text = `${start} - ${end}`;
    }

    const isCalendar = config.model === "CalendarEvent";
    const basisText = isCalendar ? "לפי זמן אירוע" : "לפי זמן יצירה";

    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-gray-500 text-xs">זמן:</span>
        <span className="text-blue-600 text-xs font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
          {text}
          <span className="text-[9px] text-blue-400 border-r border-blue-200 pr-1 mr-1">
            {basisText}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 mt-2 w-full">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <>
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </>
      )}

      {renderDateRange()}

      {config.groupByField && (
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs">קבץ לפי:</span>
          <span className="text-indigo-600 text-xs font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            {translate(config.groupByField)}
          </span>
        </div>
      )}
    </div>
  );
}

function AnalyticsCard({
  view,
  onOpenDetails,
  onColorChange,
  onEdit,
  onAddAutomation,
  onMove,
  onDelete,
  folders,
  canManage,
}: {
  view: any;
  onOpenDetails: (view: any) => void;
  onColorChange: (
    id: number,
    type: "AUTOMATION" | "CUSTOM",
    color: string
  ) => void;
  onEdit: (view: any) => void;
  onAddAutomation: (view: any) => void;
  onMove: (view: any, folderId: number | null) => void;
  onDelete: (view: any) => void;
  folders: any[];
  canManage: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false); // New state for folder picker
  const currentColor =
    COLOR_OPTIONS.find((c) => c.value === view.color) || COLOR_OPTIONS[0];

  const isAutomation = view.source === "AUTOMATION";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between aspect-square border ${currentColor.value} ${currentColor.border}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isAutomation
                  ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                  : "bg-orange-100 text-orange-700 border-orange-200"
              }`}
            >
              {isAutomation ? "אוטומציה" : "ידני"}
            </span>
          </div>
          <h3
            className="text-lg font-semibold text-gray-900 line-clamp-2"
            title={view.ruleName}
          >
            {view.ruleName}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {view.tableName === "System" ? "מערכת" : `מקור: ${view.tableName}`}
          </p>

          {!isAutomation && (
            <ConfigDetails config={view.config} type={view.type} />
          )}
        </div>
        {canManage && (
          <div className="relative flex gap-1">
            <button
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-black/5 rounded-full transition-colors"
              onPointerDown={(e) => {
                e.stopPropagation();
                setShowFolderPicker(!showFolderPicker);
                setShowColorPicker(false);
              }}
              title="העבר לתיקייה"
            >
              <Move size={16} />
            </button>
            {!isAutomation && (
              <button
                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-black/5 rounded-full transition-colors"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onAddAutomation(view);
                }}
                title="הוסף אוטומציה"
              >
                <Zap size={16} />
              </button>
            )}
            <button
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-black/5 rounded-full transition-colors"
              onPointerDown={(e) => {
                e.stopPropagation();
                onEdit(view);
              }}
              title={isAutomation ? "ערוך אוטומציה" : "ערוך תצוגה"}
            >
              {isAutomation ? <Settings size={16} /> : <Edit3 size={16} />}
            </button>
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full transition-colors"
              onPointerDown={(e) => {
                e.stopPropagation();
                setShowColorPicker(!showColorPicker);
              }}
              title="שנה צבע"
            >
              <Palette size={16} />
            </button>
            <button
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-black/5 rounded-full transition-colors"
              onPointerDown={(e) => {
                e.stopPropagation();
                onDelete(view);
              }}
              title="מחק תצוגה"
            >
              <Trash2 size={16} />
            </button>

            {showColorPicker && (
              <div
                className="absolute top-8 left-0 z-10 bg-white shadow-lg rounded-lg p-2 grid grid-cols-4 gap-1 border border-gray-100 w-32"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    className={`w-6 h-6 rounded-full border border-gray-200 ${color.value} hover:scale-110 transition-transform`}
                    onClick={() => {
                      if (isAutomation) {
                        if (view.ruleId)
                          onColorChange(view.ruleId, "AUTOMATION", color.value);
                      } else {
                        if (view.viewId)
                          onColorChange(view.viewId, "CUSTOM", color.value);
                      }
                      setShowColorPicker(false);
                    }}
                    title={color.label}
                  />
                ))}
              </div>
            )}

            {showFolderPicker && (
              <div
                className="absolute top-8 left-0 z-20 bg-white shadow-lg rounded-lg p-2 border border-gray-100 w-48 flex flex-col gap-1 max-h-60 overflow-y-auto"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-xs font-semibold text-gray-400 border-b border-gray-100 mb-1">
                  בחר תיקייה
                </div>
                <button
                  className="text-right px-2 py-1.5 text-sm hover:bg-gray-50 rounded flex items-center gap-2 text-gray-700"
                  onClick={() => {
                    onMove(view, null);
                    setShowFolderPicker(false);
                  }}
                >
                  <Folder size={14} className="text-gray-400" />
                  ראשי (ללא תיקייה)
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className="text-right px-2 py-1.5 text-sm hover:bg-gray-50 rounded flex items-center gap-2 text-gray-700"
                    onClick={() => {
                      onMove(view, f.id);
                      setShowFolderPicker(false);
                    }}
                  >
                    <Folder
                      size={14}
                      className="text-yellow-500 fill-yellow-100"
                    />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center my-4 cursor-grab active:cursor-grabbing">
        {!view.stats ? (
          <div className="text-center">
            <span className="text-4xl font-bold text-gray-200">-</span>
            <p className="text-sm text-gray-400 mt-2">אין מספיק נתונים</p>
          </div>
        ) : view.stats.mainMetric ? (
          // Generic Stats
          <div className="text-center w-full">
            <div className="text-4xl font-bold text-blue-600 mb-2 truncate px-2">
              {view.stats.mainMetric}
            </div>
            <p className="text-sm text-gray-500">{view.stats.label || "ערך"}</p>
            {view.stats.subMetric && (
              <p className="text-xs text-gray-400 mt-1" dir="ltr">
                {view.stats.subMetric}
              </p>
            )}
          </div>
        ) : (
          // Legacy Duration Stats
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {view.stats.averageDuration}
            </div>
            <p className="text-sm text-gray-500">ממוצע זמן</p>
            <div className="flex gap-4 mt-4 text-xs text-gray-600 justify-center">
              <div>
                <span className="font-semibold">מינימום:</span>{" "}
                {view.stats.minDuration}
              </div>
              <div>
                <span className="font-semibold">מקסימום:</span>{" "}
                {view.stats.maxDuration}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-black/5 pt-4 flex justify-between items-center text-sm text-gray-500">
        <span>מבוסס על:</span>
        <div className="flex items-center gap-2">
          <span className="font-medium bg-black/5 px-2 py-1 rounded-full">
            {view.stats?.totalRecords || view.data.length} רשומות
          </span>
          {view.data.length > 0 && (
            <button
              onClick={() => onOpenDetails(view)}
              className="p-1 hover:bg-black/5 rounded-full transition-colors text-blue-600"
              title="צפה ברשימה המלאה"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <List size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [views, setViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<any | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isAIMode, setIsAIMode] = useState(false);

  // Automation Modal State
  const [viewAutomationTarget, setViewAutomationTarget] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<number>(0);

  // Folder State
  const [folders, setFolders] = useState<any[]>([]);
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [movingView, setMovingView] = useState<any>(null); // View being moved

  // Toast State
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  // Filter State
  const [filter, setFilter] = useState<"all" | "manual" | "automation">("all");

  const filteredViews = views.filter((view) => {
    // Exclude Graphs (they have their own page)
    if (view.type === "GRAPH") return false;

    // 1. Folder Logic
    if (currentFolder) {
      if (view.folderId !== currentFolder) return false;
    } else {
      // Root: Hide items that are in folders
      if (view.folderId) return false;
    }

    // 2. Type Logic
    if (filter === "all") return true;
    if (filter === "manual") return view.source !== "AUTOMATION";
    if (filter === "automation") return view.source === "AUTOMATION";
    return true;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function fetchData() {
    try {
      setLoading(true);
      const [res, foldersRes] = await Promise.all([
        getAnalyticsData(),
        getViewFolders(),
      ]);

      if (res.success && res.data) {
        setViews(res.data);
      }
      if (foldersRes.success && foldersRes.data) {
        setFolders(foldersRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics data", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    getCurrentAuthUser().then((res) => {
      if (res.success && res.data) {
        if (!hasUserFlag(res.data as any, "canViewAnalytics")) {
          router.push("/");
          return;
        }
        setCanManage(hasUserFlag(res.data as any, "canManageAnalytics"));
        setCurrentUserId(res.data.id);
      }
    });
  }, []);

  const handleEdit = (view: any) => {
    if (view.source === "AUTOMATION") {
      router.push("/automations");
    } else {
      setEditingView(view);
      setIsCreateModalOpen(true);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage) return;
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setViews((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update Backend
        const updates = newItems.map((item: any, index: number) => ({
          id: item.source === "AUTOMATION" ? item.ruleId : item.viewId,
          type: (item.source === "AUTOMATION" ? "AUTOMATION" : "CUSTOM") as
            | "AUTOMATION"
            | "CUSTOM",
          order: index,
        }));

        if (updates.length > 0) updateAnalyticsViewOrder(updates);

        return newItems;
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await createViewFolder(newFolderName);
    if (res.success) {
      setFolders([...folders, res.data]);
      setIsFolderModalOpen(false);
      setNewFolderName("");
    }
  };

  const handleMoveView = async (view: any, folderId: number | null) => {
    if (!view) return;
    const type = view.source;
    const viewId = type === "AUTOMATION" ? view.ruleId : view.viewId;

    await moveViewToFolder(viewId, type, folderId);
    setMovingView(null);
    fetchData(); // Refresh data to update lists
  };

  const handleDeleteFolder = async (id: number) => {
    if (
      !confirm(
        "האם אתה בטוח שברצונך למחוק את התיקייה? הViews לא יימחקו אלא יעברו לתיקייה הראשית."
      )
    )
      return;
    await deleteViewFolder(id);
    setFolders(folders.filter((f) => f.id !== id));
    if (currentFolder === id) setCurrentFolder(null); // Go back to root
    fetchData();
  };

  const handleColorChange = async (
    id: number,
    type: "AUTOMATION" | "CUSTOM",
    color: string
  ) => {
    if (!id) return;
    setViews((prev) =>
      prev.map((v) => {
        if (type === "AUTOMATION" && v.ruleId === id) return { ...v, color };
        if (type === "CUSTOM" && v.viewId === id) return { ...v, color };
        return v;
      })
    );
    try {
      await updateAnalyticsViewColor(id, type, color);
    } catch (err) {
      console.error("Failed to update color", err);
    }
  };

  const handleDelete = async (view: any) => {
    if (view.source === "AUTOMATION") {
      setToast({
        message: "ה-VIEW מגיע מאוטומציות, נא למחוק את הview מעמוד אוטומציות",
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
      return;
    }

    if (!confirm("האם אתה בטוח שברצונך למחוק את התצוגה?")) return;

    try {
      // Assuming 'viewId' is the correct field for custom views based on previous code
      const res = await deleteAnalyticsView(view.viewId);
      if (res.success) {
        setViews((prev) => prev.filter((v) => v.viewId !== view.viewId));
        setToast({ message: "התצוגה נמחקה בהצלחה", type: "success" });
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast({ message: "שגיאה במחיקת התצוגה", type: "error" });
      }
    } catch (error) {
      console.error("Failed to delete view:", error);
      setToast({ message: "שגיאה במחיקת התצוגה", type: "error" });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ניתוח נתונים</h1>
            <p className="text-gray-500 mt-2">דוחות וניתוחים בזמן אמת.</p>
          </div>
          <div className="flex gap-3">
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAIMode(true)}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-md shadow-sm text-sm font-medium hover:opacity-90 flex items-center gap-2"
                >
                  <Sparkles size={16} className="text-yellow-300" />
                  צור עם AI
                </button>
                <button
                  onClick={() => {
                    setEditingView(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus size={16} />
                  צור תצוגה
                </button>
              </div>
            )}
            <Link
              href="/analytics/graphs"
              className="px-4 py-2 bg-pink-50 text-pink-700 border border-pink-200 rounded-md shadow-sm text-sm font-medium hover:bg-pink-100 flex items-center gap-2"
            >
              <BarChart2 size={16} />
              תצוגת גרפים
            </Link>
            <Link
              href="/"
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              חזרה לדאשבורד
            </Link>
          </div>
        </div>

        {/* Folders Bar */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setCurrentFolder(null)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap ${
              currentFolder === null
                ? "bg-blue-50 border-blue-200 text-blue-700 font-medium shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Folder
              size={18}
              className={currentFolder === null ? "fill-blue-200" : ""}
            />
            ראשי
          </button>

          {folders.map((folder) => (
            <div key={folder.id} className="relative group">
              <button
                onClick={() => setCurrentFolder(folder.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap ${
                  currentFolder === folder.id
                    ? "bg-yellow-50 border-yellow-200 text-yellow-800 font-medium shadow-sm"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Folder
                  size={18}
                  className={`text-yellow-500 ${
                    currentFolder === folder.id
                      ? "fill-yellow-200"
                      : "fill-yellow-100"
                  }`}
                />
                {folder.name}
              </button>
              {currentFolder === folder.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                  className="absolute -top-2 -left-2 bg-white text-red-500 border border-gray-200 hover:bg-red-50 hover:border-red-200 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  title="מחק תיקייה"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all whitespace-nowrap ml-2"
          >
            <FolderPlus size={18} />
            <span className="text-sm">חדש</span>
          </button>
        </div>

        {/* Filters UI */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 pb-4 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap ${
              filter === "all"
                ? "bg-gray-900 text-white shadow-md ring-2 ring-gray-900 ring-offset-2"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            הצג הכל
          </button>
          <button
            onClick={() => setFilter("manual")}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all flex items-center gap-2 whitespace-nowrap ${
              filter === "manual"
                ? "bg-orange-600 text-white shadow-md ring-2 ring-orange-600 ring-offset-2"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                filter === "manual" ? "bg-white" : "bg-orange-500"
              }`}
            />
            ידני בלבד
          </button>
          <button
            onClick={() => setFilter("automation")}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all flex items-center gap-2 whitespace-nowrap ${
              filter === "automation"
                ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-600 ring-offset-2"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <Zap size={14} />
            אוטומציות (Views)
          </button>
        </div>

        {loading && views.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : views.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500 text-lg">אין עדיין תצוגות ניתוח.</div>
            <button
              onClick={() => {
                setEditingView(null);
                setIsCreateModalOpen(true);
              }}
              className="mt-4 text-blue-600 hover:underline"
            >
              צור תצוגה חדשה
            </button>
          </div>
        ) : filteredViews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm text-center">
            <div className="bg-gray-50 p-4 rounded-full mb-4">
              <List className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              לא נמצאו תצוגות
            </h3>
            <p className="text-gray-500 mt-1 mb-4">
              נסה לשנות את הסינון כדי לראות תוצאות.
            </p>
            <button
              onClick={() => setFilter("all")}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
            >
              הצג את כל התצוגות
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredViews.map((v) => v.id)} // Use Unified ID
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredViews.map((view) => (
                  <AnalyticsCard
                    key={view.id}
                    view={view}
                    onOpenDetails={setSelectedView}
                    onColorChange={handleColorChange}
                    onEdit={handleEdit}
                    onAddAutomation={setViewAutomationTarget}
                    onMove={handleMoveView}
                    onDelete={handleDelete}
                    folders={folders}
                    canManage={canManage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <CreateAnalyticsViewModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingView(null);
        }}
        onSuccess={() => {
          fetchData();
          setIsCreateModalOpen(false);
          setEditingView(null);
        }}
        initialData={editingView}
      />

      <AIAnalyticsCreator
        isOpen={isAIMode}
        onClose={() => setIsAIMode(false)}
        onSuccess={() => {
          fetchData();
          setIsAIMode(false);
        }}
      />

      <AnalyticsDetailsModal
        isOpen={!!selectedView}
        onClose={() => setSelectedView(null)}
        title={selectedView?.ruleName || ""}
        tableName={selectedView?.tableName || ""}
        data={selectedView?.data || []}
      />

      {viewAutomationTarget && (
        <ViewAutomationModal
          onClose={() => setViewAutomationTarget(null)}
          view={viewAutomationTarget}
          userId={currentUserId || 0}
          onSuccess={() => {
            fetchData();
            // Maybe close?
          }}
        />
      )}

      {/* Create Folder Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">תיקייה חדשה</h3>
              <button
                onClick={() => setIsFolderModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם התיקייה
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="למשל: שיווק, מכירות..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              />
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  צור תיקייה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
