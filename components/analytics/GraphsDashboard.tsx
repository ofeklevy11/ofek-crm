"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAnalyticsView,
  updateAnalyticsViewOrder,
  refreshAnalyticsItemWithChecks,
} from "@/app/actions/analytics";
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
import {
  ArrowLeft,
  Plus,
  BarChart2,
  Edit3,
  Trash2,
  GripVertical,
  RefreshCw,
} from "lucide-react";
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

function SortableGraphCard({
  view,
  onEdit,
  onDelete,
  onRefresh,
  isRefreshing,
}: {
  view: any;
  onEdit: (view: any) => void;
  onDelete: (id: number) => void;
  onRefresh: (view: any) => void;
  isRefreshing: boolean;
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
    opacity: isDragging ? 0.8 : 1,
  };

  const isPieChart = view.config?.chartType?.toLowerCase() === "pie";
  const dataCount = view.data?.length || 0;
  const shouldSpanTwo = isPieChart && dataCount > 8;
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
              <p className="text-xs text-gray-400 mt-0.5">מקור: {view.tableName}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1 transition-opacity">
          <button
            onClick={() => onRefresh(view)}
            disabled={isRefreshing}
            className="p-1.5 text-gray-400 hover:text-green-600 rounded-full hover:bg-gray-50 disabled:opacity-50"
            title="רענן גרף"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => onEdit(view)}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-50"
            title="ערוך גרף"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => onDelete(view.viewId)}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-50"
            title="מחק גרף"
          >
            <Trash2 size={16} />
          </button>
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

interface GraphsDashboardProps {
  initialViews: any[];
  initialRefreshUsage: { usage: number; nextResetTime: string | null };
  userPlan: string;
}

export default function GraphsDashboard({
  initialViews,
  initialRefreshUsage,
  userPlan,
}: GraphsDashboardProps) {
  const router = useRouter();
  const [views, setViews] = useState<any[]>(initialViews);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<any | null>(null);
  const [refreshingViewId, setRefreshingViewId] = useState<string | null>(null);
  const [refreshUsage, setRefreshUsage] = useState(initialRefreshUsage.usage || 0);
  const [nextResetTime, setNextResetTime] = useState<string | null>(
    initialRefreshUsage.nextResetTime,
  );
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

  useEffect(() => {
    setViews(initialViews);
  }, [initialViews]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  let maxRefreshes = 3;
  if (userPlan === "premium") maxRefreshes = 10;
  else if (userPlan === "super") maxRefreshes = 9999;
  const refreshesLeft = Math.max(0, maxRefreshes - refreshUsage);

  const handleRefreshSingle = async (view: any) => {
    if (refreshingViewId) return;

    const viewId = view.id;
    setRefreshingViewId(viewId);
    try {
      const result = await refreshAnalyticsItemWithChecks(view.viewId, "CUSTOM");

      if (result.success) {
        setToast({ message: "מרענן גרף ברקע...", type: "success" });
        setTimeout(() => setToast(null), 5000);

        if (result.usage !== undefined) setRefreshUsage(result.usage);
        if (result.nextResetTime !== undefined) setNextResetTime(result.nextResetTime);

        // Poll for updated data
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          router.refresh();
          if (attempts >= 5) {
            clearInterval(interval);
            setRefreshingViewId(null);
          }
        }, 2000);
      } else {
        setToast({ message: result.error || "שגיאה ברענון הגרף", type: "error" });
        setTimeout(() => setToast(null), 4000);
        setRefreshingViewId(null);
      }
    } catch (error) {
      setToast({ message: "שגיאה ברענון הגרף", type: "error" });
      setTimeout(() => setToast(null), 4000);
      setRefreshingViewId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תרשים זה?")) return;
    await deleteAnalyticsView(id);
    router.refresh();
  };

  const handleEdit = (view: any) => {
    setEditingView(view);
    setIsModalOpen(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setViews((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

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

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="text-pink-600" />
              תצוגת גרפים
            </h1>
            <p className="text-gray-500 mt-2">
              ויזואליזציה של הנתונים בתצורה גרפית מתקדמת • גרור לשינוי סדר
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingView(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-pink-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-pink-700 flex items-center gap-2"
            >
              <Plus size={16} />
              צור גרף חדש
            </button>
            <a
              href="/analytics"
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              חזרה לניתוח נתונים
            </a>
          </div>
        </div>

        {/* Cache Info Banner */}
        <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-100/80 rounded-xl px-5 py-3.5 mb-8 flex items-start gap-3">
          <div className="bg-blue-100 rounded-lg p-2 shrink-0">
            <RefreshCw size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-900 font-semibold">מערכת קאש חכמה</p>
            <p className="text-xs text-blue-700/80 mt-1 leading-relaxed">
              הנתונים מתעדכנים אוטומטית כל 4 שעות ונשמרים בקאש לטעינה מהירה.
              ניתן לרענן כל גרף בנפרד בלחיצה על כפתור הרענון בפינת כל כרטיס.
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

        {/* Content */}
        {views.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100 flex flex-col items-center">
            <div className="bg-pink-50 p-4 rounded-full mb-4">
              <BarChart2 className="text-pink-500" size={48} />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              אין גרפים להצגה
            </h3>
            <p className="text-gray-500 max-w-sm mb-6">
              צור את הגרף הראשון שלך כדי לראות את הנתונים בצורה ויזואלית
              ומרשימה.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2 bg-pink-600 text-white rounded-full hover:bg-pink-700 transition-colors shadow-lg shadow-pink-200"
            >
              צור גרף ראשון
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={views.map((v) => v.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {views.map((view) => (
                  <SortableGraphCard
                    key={view.id}
                    view={view}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRefresh={handleRefreshSingle}
                    isRefreshing={refreshingViewId === view.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <CreateAnalyticsViewModal
          isOpen={isModalOpen}
          initialData={editingView}
          mode="graph"
          onClose={() => {
            setIsModalOpen(false);
            setEditingView(null);
          }}
          onSuccess={() => {
            setIsModalOpen(false);
            setEditingView(null);
            router.refresh();
          }}
        />
      </div>

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
