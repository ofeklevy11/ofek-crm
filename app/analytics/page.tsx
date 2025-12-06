"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAnalyticsData } from "@/app/actions/analytics";
import { Loader2, List, Plus, Palette, Edit3, Settings } from "lucide-react";
import Link from "next/link";
import AnalyticsDetailsModal from "@/components/AnalyticsDetailsModal";
import CreateAnalyticsViewModal from "@/components/analytics/CreateAnalyticsViewModal";
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

  return (
    <div className="flex flex-col gap-1.5 mt-2 w-full">
      {type === "COUNT" && renderFilter(config.filter)}
      {type === "CONVERSION" && (
        <>
          {renderFilter(config.totalFilter, "סה״כ")}
          {renderFilter(config.successFilter, "הצלחה")}
        </>
      )}
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
}: {
  view: any;
  onOpenDetails: (view: any) => void;
  onColorChange: (
    id: number,
    type: "AUTOMATION" | "CUSTOM",
    color: string
  ) => void;
  onEdit: (view: any) => void;
}) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
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
        <div className="relative flex gap-1">
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
        </div>
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function fetchData() {
    try {
      setLoading(true);
      const res = await getAnalyticsData();
      if (res.success && res.data) {
        setViews(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics data", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
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

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ניתוח נתונים</h1>
            <p className="text-gray-500 mt-2">דוחות וניתוחים בזמן אמת.</p>
          </div>
          <div className="flex gap-3">
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
            <Link
              href="/"
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              חזרה לדאשבורד
            </Link>
          </div>
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
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={views.map((v) => v.id)} // Use Unified ID
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {views.map((view) => (
                  <AnalyticsCard
                    key={view.id}
                    view={view}
                    onOpenDetails={setSelectedView}
                    onColorChange={handleColorChange}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Create Modal */}
      <CreateAnalyticsViewModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingView(null);
        }}
        onSuccess={fetchData}
        initialData={editingView}
      />

      {/* Details Modal */}
      {selectedView && (
        <AnalyticsDetailsModal
          isOpen={!!selectedView}
          onClose={() => setSelectedView(null)}
          title={selectedView.ruleName}
          tableName={selectedView.tableName}
          data={selectedView.data}
        />
      )}
    </div>
  );
}
