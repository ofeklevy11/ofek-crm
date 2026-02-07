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
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
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
import {
  Folder,
  FolderPlus,
  ArrowLeft,
  Move,
  X,
  Trash2,
  GripVertical,
} from "lucide-react";
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
  leadStatus: "סטטוס ליד",
  source: "מקור",
  type: "סוג",
  lead: "ליד",
  isClosed: "נסגר",
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
      <div className="flex flex-wrap gap-1.5 items-center mt-2">
        {label && (
          <span className="text-gray-400 text-[10px] font-medium uppercase tracking-wider ml-1">
            {label}
          </span>
        )}
        {Object.entries(filter).map(([key, val]) => (
          <span
            key={key}
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-100"
          >
            <span className="opacity-60 ml-1">{translate(key)}:</span>
            <span>{translate(String(val))}</span>
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
    const basisText = isCalendar ? "זמן אירוע" : "זמן יצירה";

    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          זמן
        </span>
        <div className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
          <span className="font-medium">{text}</span>
          <span className="w-px h-3 bg-blue-200 mx-0.5"></span>
          <span className="text-[10px] opacity-75">{basisText}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1 w-full mt-2">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <div className="flex flex-col gap-1">
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </div>
      )}

      {renderDateRange()}

      {config.groupByField && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            קבץ לפי
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
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
    color: string,
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
    opacity: isDragging ? 0.8 : 1,
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Resolve accent color from persistent 'bg-*-50' value
  const getAccentClass = (bgVal: string) => {
    switch (bgVal) {
      case "bg-red-50":
        return "bg-red-500";
      case "bg-yellow-50":
        return "bg-yellow-500";
      case "bg-green-50":
        return "bg-green-500";
      case "bg-blue-50":
        return "bg-blue-500";
      case "bg-purple-50":
        return "bg-purple-500";
      case "bg-pink-50":
        return "bg-pink-500";
      default:
        return "bg-gray-200";
    }
  };

  const isAutomation = view.source === "AUTOMATION";
  const accentClass = getAccentClass(view.color);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex flex-col justify-between h-full bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 border border-gray-100 overflow-hidden"
    >
      {/* Top Accent Line */}
      <div className={`h-1.5 w-full shrink-0 ${accentClass}`} />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header Row */}
        <div className="flex justify-between items-start">
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAutomation
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                    : "bg-gray-50 text-gray-600 border-gray-100"
                }`}
              >
                {isAutomation ? "אוטומציה" : "ידני"}
              </span>
            </div>
            <h3
              className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight"
              title={view.ruleName}
            >
              {view.ruleName}
            </h3>
            <p className="text-xs text-gray-400 mt-1 font-medium truncate">
              {view.tableName === "System"
                ? "מערכת"
                : `מקור: ${view.tableName}`}
            </p>

            {!isAutomation && (
              <div className="mt-1">
                <ConfigDetails config={view.config} type={view.type} />
              </div>
            )}
          </div>

          {/* Actions - Visible on Hover */}
          {canManage && (
            <div className="absolute top-4 left-4 flex gap-1 bg-white/95 backdrop-blur rounded-lg p-1 border border-gray-100 shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 scale-100 md:scale-90 md:group-hover:scale-100 transition-all duration-200 origin-top-left z-10">
              <button
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowFolderPicker(!showFolderPicker);
                  setShowColorPicker(false);
                }}
                title="העבר לתיקייה"
              >
                <Move size={14} />
              </button>
              {!isAutomation && (
                <button
                  className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onAddAutomation(view);
                  }}
                  title="הוסף אוטומציה"
                >
                  <Zap size={14} />
                </button>
              )}
              <button
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onEdit(view);
                }}
                title={isAutomation ? "ערוך אוטומציה" : "ערוך תצוגה"}
              >
                {isAutomation ? <Settings size={14} /> : <Edit3 size={14} />}
              </button>
              <button
                className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
                title="שנה צבע"
              >
                <Palette size={14} />
              </button>
              <button
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onDelete(view);
                }}
                title="מחק תצוגה"
              >
                <Trash2 size={14} />
              </button>

              {/* Popups */}
              {showColorPicker && (
                <div
                  className="absolute top-full left-0 mt-2 z-20 bg-white shadow-xl rounded-xl p-3 grid grid-cols-4 gap-2 border border-gray-100 w-40"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      className={`w-6 h-6 rounded-full border border-gray-200 ${color.value} hover:scale-110 transition-transform ring-2 ring-transparent hover:ring-gray-100`}
                      onClick={() => {
                        if (isAutomation) {
                          if (view.ruleId)
                            onColorChange(
                              view.ruleId,
                              "AUTOMATION",
                              color.value,
                            );
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
                  className="absolute top-full left-0 mt-2 z-20 bg-white shadow-xl rounded-xl p-2 border border-gray-100 w-56 flex flex-col gap-1 max-h-60 overflow-y-auto"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 mb-1">
                    בחר תיקייה
                  </div>
                  <button
                    className="text-right px-3 py-2 text-xs hover:bg-gray-50 rounded-lg flex items-center gap-2 text-gray-600 font-medium transition-colors"
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
                      className="text-right px-3 py-2 text-xs hover:bg-yellow-50 rounded-lg flex items-center gap-2 text-gray-700 font-medium transition-colors"
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

        {/* Center Stats */}
        <div className="flex-1 flex flex-col justify-center items-center my-4 cursor-grab active:cursor-grabbing">
          {!view.stats ? (
            <div className="text-center opacity-50">
              <span className="text-4xl font-light text-gray-300">-</span>
              <p className="text-xs text-gray-400 mt-2">אין נתונים</p>
            </div>
          ) : view.stats.mainMetric ? (
            <div className="text-center w-full">
              <div className="text-5xl font-extrabold text-gray-900 mb-1 tracking-tight truncate px-2 leading-none">
                {view.stats.mainMetric}
              </div>
              <p className="text-sm font-medium text-gray-500">
                {view.stats.label || "ערך"}
              </p>
              {view.stats.subMetric && (
                <p
                  className="text-xs font-medium text-gray-400 mt-1 font-mono"
                  dir="ltr"
                >
                  {view.stats.subMetric}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center w-full">
              <div className="text-4xl font-bold text-gray-900 mb-2 truncate">
                {view.stats.averageDuration}
              </div>
              <p className="text-sm text-gray-500">ממוצע זמן</p>
              <div className="flex gap-4 mt-3 text-[10px] text-gray-400 justify-center font-mono">
                <div className="flex flex-col items-center">
                  <span className="font-bold text-gray-300 uppercase">Min</span>
                  {view.stats.minDuration}
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-bold text-gray-300 uppercase">Max</span>
                  {view.stats.maxDuration}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 flex justify-between items-center text-xs text-gray-400 transition-colors group-hover:bg-gray-50">
        <span className="font-medium">
          {view.stats?.totalRecords || view.data.length} רשומות
        </span>
        {view.data.length > 0 && (
          <button
            onClick={() => onOpenDetails(view)}
            className="group/list p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-blue-600 border border-transparent hover:border-blue-100"
            title="צפה ברשימה המלאה"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <List
              size={16}
              className="group-hover/list:scale-110 transition-transform"
            />
          </button>
        )}
      </div>
    </div>
  );
}

// Sortable Graph Card Component
function SortableGraphCard({ view }: { view: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.8 : 1,
  };

  // Determine if this card should span 2 columns (for pie charts with many items)
  const isPieChart = view.config?.chartType?.toLowerCase() === "pie";
  const dataCount = view.data?.length || 0;
  const shouldSpanTwo = isPieChart && dataCount > 8;

  // Dynamic height based on data count for pie charts
  const chartHeight = shouldSpanTwo ? 450 : 300;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow ${
        shouldSpanTwo ? "md:col-span-2" : ""
      }`}
    >
      <div className="p-4 border-b border-gray-50 flex justify-between items-start">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 mt-1"
            title="גרור לשינוי סדר"
          >
            <GripVertical size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{view.ruleName}</h3>
            <p className="text-sm text-gray-500">{view.stats?.subMetric}</p>
          </div>
        </div>
      </div>

      <div className="p-4" dir="ltr">
        <AnalyticsGraph
          data={view.data}
          type={view.config.chartType}
          height={chartHeight}
        />
      </div>

      <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 flex justify-between items-center text-sm">
        <span className="text-gray-500">
          סה״כ: <strong>{view.stats?.mainMetric}</strong>
        </span>
        <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
          {view.tableName}
        </span>
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

  // Graph Views State
  const [graphViews, setGraphViews] = useState<any[]>([]);

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
    }),
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
        // Separate graph views for the graphs section
        setGraphViews(res.data.filter((v: any) => v.type === "GRAPH"));
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

  // Handle Graph Drag End
  const handleGraphDragEnd = async (event: DragEndEvent) => {
    if (!canManage) return;
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setGraphViews((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update Backend - graphs are always CUSTOM type
        const updates = newItems.map((item: any, index: number) => ({
          id: item.viewId,
          type: "CUSTOM" as "AUTOMATION" | "CUSTOM",
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
        "האם אתה בטוח שברצונך למחוק את התיקייה? הViews לא יימחקו אלא יעברו לתיקייה הראשית.",
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
    color: string,
  ) => {
    if (!id) return;
    setViews((prev) =>
      prev.map((v) => {
        if (type === "AUTOMATION" && v.ruleId === id) return { ...v, color };
        if (type === "CUSTOM" && v.viewId === id) return { ...v, color };
        return v;
      }),
    );
    try {
      await updateAnalyticsViewColor(id, type, color);
    } catch (err) {
      console.error("Failed to update color", err);
    }
  };

  const handleDelete = async (view: any) => {
    if (view.source === "AUTOMATION") {
      alert(
        "על מנת למחוק אנליטיקה שנוצרה על ידי אוטומציה נצטרך למחוק את האוטומציה עצמה בעמוד אוטומציות.",
      );
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ניתוח נתונים</h1>
            <p className="text-gray-500 mt-2">דוחות וניתוחים בזמן אמת.</p>
          </div>
          <div className="flex gap-3">
            {canManage && (
              <div className="hidden md:flex gap-2">
                <button
                  disabled
                  className="px-4 py-2 bg-gray-300 text-gray-500 rounded-md shadow-sm text-sm font-medium cursor-not-allowed flex items-center gap-2"
                >
                  <Sparkles size={16} className="text-gray-400" />
                  צור עם AI (בקרוב...)
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
        <div className="flex gap-2 mb-6 border-b border-gray-200 p-1 pb-4 overflow-x-auto">
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

        {/* Graphs Section */}
        {graphViews.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-pink-50 p-2 rounded-lg">
                  <BarChart2 className="text-pink-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    תצוגת גרפים
                  </h2>
                  <p className="text-sm text-gray-500">
                    ויזואליזציה גרפית של הנתונים{" "}
                    {canManage && "• גרור לשינוי סדר"}
                  </p>
                </div>
              </div>
              <a
                href="/analytics/graphs"
                className="px-4 py-2 text-sm font-medium text-pink-600 hover:text-pink-700 hover:bg-pink-50 rounded-lg transition-colors flex items-center gap-2"
              >
                לעריכת ומחיקת גרפים <ArrowLeft size={14} />
              </a>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleGraphDragEnd}
            >
              <SortableContext
                items={graphViews.map((v) => v.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {graphViews.map((view) => (
                    <SortableGraphCard key={view.id} view={view} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
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
