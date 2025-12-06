"use client";

import { useEffect, useState } from "react";
import { getAnalyticsData } from "@/app/actions/analytics";
import { Loader2, List } from "lucide-react";
import Link from "next/link";
import AnalyticsDetailsModal from "@/components/AnalyticsDetailsModal";
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
import { Palette } from "lucide-react";

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

function AnalyticsCard({
  view,
  onOpenDetails,
  onColorChange,
}: {
  view: any;
  onOpenDetails: (view: any) => void;
  onColorChange: (ruleId: number, color: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.ruleId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
  const currentColor =
    COLOR_OPTIONS.find((c) => c.value === view.color) || COLOR_OPTIONS[0];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between aspect-square border ${currentColor.value} ${currentColor.border}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3
            className="text-lg font-semibold text-gray-900 line-clamp-2"
            title={view.ruleName}
          >
            {view.ruleName}
          </h3>
          <p className="text-sm text-gray-500 mt-1">מקור: {view.tableName}</p>
        </div>
        <div className="relative">
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full transition-colors"
            onPointerDown={(e) => {
              // Using onPointerDown to prevent drag start
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
                    onColorChange(view.ruleId, color.value);
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
        {view.data.length === 0 ? (
          <div className="text-center">
            <span className="text-4xl font-bold text-gray-200">-</span>
            <p className="text-sm text-gray-400 mt-2">אין מספיק נתונים</p>
          </div>
        ) : !view.stats ? (
          <div className="text-center">
            <span className="text-4xl font-bold text-gray-200">-</span>
            <p className="text-sm text-gray-400 mt-2">אין מספיק נתונים</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {view.stats.averageDuration}
            </div>
            <p className="text-sm text-gray-500">ממוצע זמן</p>
            <div className="flex gap-4 mt-4 text-xs text-gray-600">
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
            {view.data.length} רשומות
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
  const [views, setViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    async function fetchData() {
      try {
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
    fetchData();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setViews((items) => {
        const oldIndex = items.findIndex((i) => i.ruleId === active.id);
        const newIndex = items.findIndex((i) => i.ruleId === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Optimistic update
        const updates = newItems.map((item: any, index: number) => ({
          ruleId: item.ruleId,
          order: index,
        }));

        // Fire and forget update
        updateAnalyticsViewOrder(updates);

        return newItems;
      });
    }
  };

  const handleColorChange = async (ruleId: number, color: string) => {
    // Optimistic update
    setViews((prev) =>
      prev.map((v) => (v.ruleId === ruleId ? { ...v, color } : v))
    );
    try {
      await updateAnalyticsViewColor(ruleId, color);
    } catch (err) {
      console.error("Failed to update color", err);
      // Revert or show error could happen here, but keeping it simple for now
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ניתוח נתונים</h1>
            <p className="text-gray-500 mt-2">
              צפה בנתוני זמנים המחושבים על ידי האוטומציות שלך. גרור והשלך כדי
              לסדר מחדש.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            חזרה לדאשבורד
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : views.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500 text-lg">
              לא נמצאו אוטומציות לחישוב זמנים.
            </div>
            <div className="text-gray-400 mt-2">
              צור אוטומציה חדשה עם פעולה "חישוב זמן בסטטוס" כדי לראות כאן
              נתונים.
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={views.map((v) => v.ruleId)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {views.map((view) => (
                  <AnalyticsCard
                    key={view.ruleId}
                    view={view}
                    onOpenDetails={setSelectedView}
                    onColorChange={handleColorChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

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
