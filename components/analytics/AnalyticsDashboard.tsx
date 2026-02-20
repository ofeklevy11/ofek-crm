"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getAnalyticsData,
  updateAnalyticsViewOrder,
  updateAnalyticsViewColor,
  deleteAnalyticsView,
  refreshAnalyticsItemWithChecks,
} from "@/app/actions/analytics";
import {
  createViewFolder,
  // getViewFolders, // We receive this as prop now
  deleteViewFolder,
  moveViewToFolder,
} from "@/app/actions/view-folders";
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
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import AnalyticsDetailsModal from "@/components/AnalyticsDetailsModal";
import CreateAnalyticsViewModal from "@/components/analytics/CreateAnalyticsViewModal";
import ViewAutomationModal from "@/components/analytics/ViewAutomationModal";
import AIAnalyticsCreator from "@/components/analytics/AIAnalyticsCreator";
import AIReportCreator from "@/components/analytics/AIReportCreator";
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
  Folder,
  FolderPlus,
  ArrowLeft,
  Move,
  X,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
            <span>
              {val ? translate(String(val)) : "כל הערכים (ללא סינון)"}
            </span>
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
  onRefresh,
  isRefreshing,
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
  onRefresh: (view: any) => void;
  isRefreshing: boolean;
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

      <div className="p-5 flex-1 flex flex-col cursor-grab active:cursor-grabbing">
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
        <div className="flex-1 flex flex-col justify-center items-center my-4">
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
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {view.stats?.totalRecords || view.data.length} רשומות
          </span>
          {view.lastRefreshed && (
            <span className="text-[10px] opacity-75">
              עודכן{" "}
              {new Date(view.lastRefreshed).toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefresh(view)}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-gray-400 hover:text-blue-600 border border-transparent hover:border-blue-100 disabled:opacity-50"
            title="רענן נתון"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>
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
            {view.tableName && view.tableName !== "..." && (
              <p className="text-xs text-gray-400 mt-0.5">
                מקור: {view.tableName}
              </p>
            )}
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

interface AnalyticsDashboardProps {
  initialViews: any[];
  initialFolders: any[];
  initialRefreshUsage: { usage: number; nextResetTime: string | null };
  currentUser: { id: number; canManage: boolean; plan: string };
  loadError?: string | null;
}

export default function AnalyticsDashboard({
  initialViews,
  initialFolders,
  initialRefreshUsage,
  currentUser,
  loadError,
}: AnalyticsDashboardProps) {
  const router = useRouter();
  const [views, setViews] = useState<any[]>(() =>
    initialViews.filter((v: any) => v.type !== "GRAPH"),
  );
  const [folders, setFolders] = useState<any[]>(initialFolders);
  const [refreshUsage, setRefreshUsage] = useState(
    initialRefreshUsage.usage || 0,
  );
  const [nextResetTime, setNextResetTime] = useState<string | null>(
    initialRefreshUsage.nextResetTime,
  );

  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<any | null>(null);
  const canManage = currentUser.canManage;
  const [isAIMode, setIsAIMode] = useState(false);
  const [isReportMode, setIsReportMode] = useState(false);

  // Automation Modal State
  const [viewAutomationTarget, setViewAutomationTarget] = useState<any>(null);
  const currentUserId = currentUser.id;
  const userPlan = currentUser.plan;

  // Folder State
  const [currentFolder, setCurrentFolder] = useState<number | "all">("all");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [movingView, setMovingView] = useState<any>(null); // View being moved

  // Graph Views State
  const [graphViews, setGraphViews] = useState<any[]>(() =>
    initialViews.filter((v: any) => v.type === "GRAPH"),
  );
  const [refreshingViewId, setRefreshingViewId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount (handles Next.js client navigation)
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Sync state when props change (e.g. after router.refresh())
  useEffect(() => {
    setViews(initialViews.filter((v: any) => v.type !== "GRAPH"));
    setGraphViews(initialViews.filter((v: any) => v.type === "GRAPH"));
    setFolders(initialFolders);
  }, [initialViews, initialFolders]);

  // Toast State
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  // Filter State
  const [filter, setFilter] = useState<"all" | "manual" | "automation">("all");

  const filteredViews = views.filter((view) => {
    // 1. Folder Logic
    if (currentFolder === "all") {
      // Show everything, ignore folderId
    } else {
      if (view.folderId !== currentFolder) return false;
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


  const handleRefreshSingle = async (view: any) => {
    if (refreshingViewId) return;

    const viewId = view.id;
    setRefreshingViewId(viewId);
    try {
      const itemId = view.source === "AUTOMATION" ? view.ruleId : view.viewId;
      const itemType = view.source === "AUTOMATION" ? "AUTOMATION" : "CUSTOM";

      // Single combined server action: check eligibility + log + trigger + get usage
      const result = await refreshAnalyticsItemWithChecks(
        itemId,
        itemType as "AUTOMATION" | "CUSTOM",
      );

      if (result.success) {
        setToast({ message: "מרענן נתונים ברקע...", type: "success" });
        setTimeout(() => setToast(null), 5000);

        // Update usage from the combined response
        if (result.usage !== undefined) setRefreshUsage(result.usage);
        if (result.nextResetTime !== undefined) setNextResetTime(result.nextResetTime);

        // Poll for updated data
        let attempts = 0;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(() => {
          attempts++;
          router.refresh();
          if (attempts >= 5) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setRefreshingViewId(null);
          }
        }, 2000);
      } else {
        setToast({
          message: result.error || "שגיאה ברענון הנתון",
          type: "error",
        });
        setTimeout(() => setToast(null), 4000);
        setRefreshingViewId(null);
      }
    } catch (error) {
      setToast({ message: "שגיאה ברענון הנתון", type: "error" });
      setTimeout(() => setToast(null), 4000);
      setRefreshingViewId(null);
    }
  };

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
      router.refresh();
    }
  };

  const handleMoveView = async (view: any, folderId: number | null) => {
    if (!view) return;
    const type = view.source;
    const viewId = type === "AUTOMATION" ? view.ruleId : view.viewId;

    await moveViewToFolder(viewId, type, folderId);
    setMovingView(null);
    router.refresh();
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
    if (currentFolder === id) setCurrentFolder("all");
    router.refresh();
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
      setViews((prev) => prev.filter((v) => v.viewId !== view.viewId));
      setGraphViews((prev) => prev.filter((v) => v.viewId !== view.viewId));
      await deleteAnalyticsView(view.viewId);
      router.refresh();
    } catch (err) {
      console.error("Failed to delete view", err);
    }
  };

  const handleAIResults = () => {
    router.refresh();
  };

  // Determine limits based on plan
  let maxRefreshes = 3;
  if (userPlan === "premium") {
    maxRefreshes = 10;
  } else if (userPlan === "super") {
    maxRefreshes = 9999;
  }
  const refreshesLeft = Math.max(0, maxRefreshes - refreshUsage);

  return (
    <div
      className="min-h-screen bg-[#f4f8f8] py-8 px-4 sm:px-6 lg:px-8"
      dir="rtl"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              אנליטיקות ותובנות
            </h1>
            <p className="text-gray-500 mt-2 text-sm max-w-2xl">
              מרכז הבקרה שלך לעסקים - צפה בנתונים בזמן אמת, נתח ביצועים וקבל
              החלטות מבוססות נתונים.
            </p>
          </div>

          {!loading && canManage && (
            <div className="flex flex-col items-stretch gap-3">
              <div className="flex items-center gap-3">
                <Link
                  href="/analytics/graphs"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl shadow-sm transition-all font-medium text-sm"
                >
                  <BarChart2 size={16} />
                  <span>גרפים</span>
                </Link>

                <button
                  onClick={() => setIsReportMode(true)}
                  disabled={true}
                  className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-violet-200 transition-all font-medium text-sm cursor-not-allowed opacity-50"
                >
                  <Sparkles size={16} />
                  <span>דוח AI (בקרוב...)</span>
                </button>

                <button
                  onClick={() => setIsAIMode(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-purple-200 transition-all font-medium text-sm"
                >
                  <Sparkles size={16} />
                  <span>צור עם AI</span>
                </button>

                <button
                  onClick={() => {
                    setEditingView(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg shadow-gray-200 transition-all font-medium text-sm"
                >
                  <Plus size={16} />
                  <span>חדש</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setEditingView(null);
                  setIsCreateModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl shadow-sm transition-all font-semibold text-sm"
              >
                <Edit3 size={16} />
                <span>ערוך את הנליטיקה</span>
              </button>
            </div>
          )}
        </div>

        {/* Filters and Folders Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-2xl border border-gray-100 shadow-sm mb-10 mx-1 gap-4">
          {/* Right Side: Folders */}
          <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar scroll-smooth">
            {/* Create Folder Button */}
            {canManage && (
              <button
                onClick={() => setIsFolderModalOpen(true)}
                className="shrink-0 p-3 text-gray-400 hover:bg-gray-50 hover:text-gray-600 rounded-xl transition-colors bg-gray-50/50 border border-gray-100"
                title="צור תיקייה חדשה"
              >
                <FolderPlus size={20} />
              </button>
            )}

            <div className="h-8 w-px bg-gray-200 mx-2 shrink-0" />

            {/* All Analytics Button */}
            <button
              onClick={() => setCurrentFolder("all")}
              className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                currentFolder === "all"
                  ? "bg-purple-900 text-white shadow-lg shadow-purple-200 scale-105"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100"
              }`}
            >
              <Zap
                size={18}
                className={currentFolder === "all" ? "text-purple-300" : ""}
              />
              כל האנליטיקות
            </button>

            {/* Folder List */}
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`group relative shrink-0 flex items-center pr-4 pl-10 py-2.5 rounded-xl text-sm font-bold transition-all border cursor-pointer shadow-sm hover:shadow-md ${
                  currentFolder === folder.id
                    ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                    : "bg-white text-gray-600 border-gray-100 hover:bg-gray-50"
                }`}
                onClick={() => setCurrentFolder(folder.id)}
              >
                <Folder
                  size={18}
                  className={`ml-2 ${
                    currentFolder === folder.id
                      ? "fill-yellow-500 text-yellow-600"
                      : "fill-yellow-100 text-yellow-400"
                  }`}
                />
                {folder.name}

                {/* Delete Folder Button */}
                {canManage && (
                  <button
                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <style jsx>{`
            .hide-scrollbar::-webkit-scrollbar {
              display: none;
            }
            .hide-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}</style>

          {/* Left Side: View Type Filters */}
          <div className="flex bg-gray-100/50 p-1.5 rounded-xl mt-4 sm:mt-0 gap-1">
            <button
              onClick={() => setFilter("all")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                filter === "all"
                  ? "bg-pink-100 text-pink-700 shadow-sm border border-pink-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setFilter("manual")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                filter === "manual"
                  ? "bg-pink-100 text-pink-700 shadow-sm border border-pink-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              ידני
            </button>
            <button
              onClick={() => setFilter("automation")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                filter === "automation"
                  ? "bg-pink-100 text-pink-700 shadow-sm border border-pink-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              אוטומציה
            </button>
          </div>
        </div>

        {/* Content Details (Active Folder Name) */}
        {currentFolder !== "all" && (
          <div className="mb-6 flex items-center gap-2 text-gray-400 text-sm">
            <ArrowLeft size={14} />
            <span>
              מציג תיקייה:{" "}
              <span className="font-bold text-gray-900">
                {folders.find((f) => f.id === currentFolder)?.name}
              </span>
            </span>
          </div>
        )}

        {/* AI Creator Panel */}
        {isAIMode && (
          <div className="mt-8 mb-8 animate-in slide-in-from-top-4 duration-300">
            <AIAnalyticsCreator
              isOpen={isAIMode}
              onClose={() => setIsAIMode(false)}
              onSuccess={handleAIResults}
            />
          </div>
        )}

        {/* AI Report Creator (full-screen overlay) */}
        <AIReportCreator
          isOpen={isReportMode}
          onClose={() => setIsReportMode(false)}
          onSuccess={handleAIResults}
        />

        {/* Automations Guide Banner */}
        <div className="bg-gradient-to-l from-amber-50 to-orange-50 border border-amber-100/80 rounded-xl px-5 py-3.5 mt-6 flex items-start gap-3">
          <div className="bg-amber-100 rounded-lg p-2 shrink-0">
            <Zap size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-900 font-semibold">
              אוטומציות אנליטיקה
            </p>
            <p className="text-xs text-amber-700/80 mt-1 leading-relaxed">
              ניתן להגדיר אוטומציות על כל כרטיס נתון באמצעות כפתור ה-&#9889;
              בתחתית הכרטיס. פעולות אפשריות: התראה, הודעת WhatsApp, Webhook או
              יצירת משימה.
            </p>
            <p className="text-[11px] text-amber-800 bg-amber-100/80 mt-2 px-2.5 py-1.5 rounded-lg font-medium leading-relaxed">
              &#9888;&#65039; חשוב: האוטומציות בודקות את הערך הנוכחי{" "}
              <span className="font-bold underline">רק בזמן רענון נתונים</span>{" "}
              &mdash; כל עוד לא לחצתם על כפתור הרענון או שבוצע רענון אוטומטי,
              האוטומציה לא תיבדק ולא תפעל.
            </p>
            <p className="text-[11px] text-amber-600/70 mt-1.5">
              לדוגמה: &quot;שלח לי התראה כשמספר הלקוחות גדול מ-100&quot;
            </p>
          </div>
        </div>

        {/* Cache Info Banner */}
        <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-100/80 rounded-xl px-5 py-3.5 mt-3 flex items-start gap-3">
          <div className="bg-blue-100 rounded-lg p-2 shrink-0">
            <RefreshCw size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-900 font-semibold">
              מערכת קאש חכמה
            </p>
            <p className="text-xs text-blue-700/80 mt-1 leading-relaxed">
              הנתונים מתעדכנים אוטומטית כל 4 שעות ונשמרים בקאש לטעינה מהירה.
              ניתן לרענן כל נתון בנפרד בלחיצה על כפתור הרענון בתחתית כל כרטיס.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px]">
              {userPlan !== "super" ? (
                <span className="bg-blue-100/80 text-blue-800 px-2.5 py-1 rounded-lg font-medium">
                  {refreshesLeft > 0
                    ? `נותרו ${refreshesLeft} מתוך ${maxRefreshes} רענונים`
                    : "נגמרה מכסת הרענונים"}
                </span>
              ) : (
                <span className="bg-blue-100/80 text-blue-800 px-2.5 py-1 rounded-lg font-medium">
                  רענונים ללא הגבלה
                </span>
              )}
              {nextResetTime && userPlan !== "super" && (
                <span className="text-blue-600/70">
                  איפוס ב-
                  {new Date(nextResetTime).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <span className="text-blue-600/50">
                {userPlan === "basic" && "בסיסית: 3 רענונים"}
                {userPlan === "premium" && "Premium: 10 רענונים"}
                {userPlan === "super" && "Super: ללא הגבלה"}
                {" כל 4 שעות"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-blue-500" size={48} />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto pb-20">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredViews.map((v) => v.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredViews.length === 0 ? (
                  loadError ? (
                    <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-red-100">
                      <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BarChart2 className="text-red-400" size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        שגיאה בטעינת הנתונים
                      </h3>
                      <p className="text-gray-500 mt-1 max-w-sm mx-auto mb-6">
                        לא הצלחנו לטעון את הנתונים. נסה לרענן את הדף.
                      </p>
                      <button
                        onClick={() => router.refresh()}
                        className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-red-200 inline-flex items-center gap-2"
                      >
                        <RefreshCw size={16} />
                        נסה שוב
                      </button>
                    </div>
                  ) : (
                  <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-dashed border-gray-200">
                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart2 className="text-gray-300" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">
                      אין נתונים להצגה
                    </h3>
                    <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                      {filter !== "all"
                        ? "נסה לשנות את הסינון או בחר תיקייה אחרת"
                        : "צור תצוגה חדשה או הוסף אוטומציה כדי לראות נתונים כאן"}
                    </p>
                  </div>
                  )
                ) : (
                  filteredViews.map((view) => (
                    <AnalyticsCard
                      key={view.id}
                      view={view}
                      onOpenDetails={setSelectedView}
                      onColorChange={handleColorChange}
                      onEdit={handleEdit}
                      onAddAutomation={(v) => setViewAutomationTarget(v)}
                      onMove={handleMoveView}
                      onDelete={handleDelete}
                      onRefresh={handleRefreshSingle}
                      isRefreshing={refreshingViewId === view.id}
                      folders={folders}
                      canManage={canManage}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {selectedView && (
        <AnalyticsDetailsModal
          isOpen={true}
          title={selectedView.ruleName}
          tableName={selectedView.tableName}
          data={selectedView.data || []}
          onClose={() => setSelectedView(null)}
        />
      )}

      {isCreateModalOpen && (
        <CreateAnalyticsViewModal
          initialData={editingView}
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingView(null);
          }}
          onSuccess={() => {
            router.refresh();
            setIsCreateModalOpen(false);
            setEditingView(null);
          }}
        />
      )}

      {/* New Folder Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              יצירת תיקייה חדשה
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              תן שם לתיקייה כדי לארגן את התצוגות שלך
            </p>
            <input
              type="text"
              autoFocus
              placeholder="שם התיקייה..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none mb-6"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                onClick={() => setIsFolderModalOpen(false)}
              >
                ביטול
              </button>
              <button
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                צור תיקייה
              </button>
            </div>
          </div>
        </div>
      )}

      {viewAutomationTarget && (
        <ViewAutomationModal
          view={viewAutomationTarget}
          isOpen={!!viewAutomationTarget}
          onClose={() => setViewAutomationTarget(null)}
          userPlan={userPlan}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-green-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
