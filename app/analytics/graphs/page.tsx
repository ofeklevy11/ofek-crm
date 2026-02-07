"use client";

import { useEffect, useState } from "react";
import {
  getAnalyticsData,
  deleteAnalyticsView,
  updateAnalyticsViewOrder,
} from "@/app/actions/analytics";
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
import {
  ArrowLeft,
  Plus,
  BarChart2,
  Edit3,
  Trash2,
  GripVertical,
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

// Sortable Graph Card Component
function SortableGraphCard({
  view,
  onEdit,
  onDelete,
}: {
  view: any;
  onEdit: (view: any) => void;
  onDelete: (id: number) => void;
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
        <div className="flex gap-1 transition-opacity">
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

export default function GraphsPage() {
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<any | null>(null);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getAnalyticsData();
      if (res.success && res.data) {
        // Filter only GRAPH views
        setViews(res.data.filter((v: any) => v.type === "GRAPH"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תרשים זה?")) return;
    await deleteAnalyticsView(id);
    fetchData();
  };

  const handleEdit = (view: any) => {
    setEditingView(view);
    setIsModalOpen(true);
  };

  // Handle Drag End
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setViews((items) => {
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

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
          </div>
        ) : views.length === 0 ? (
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
            fetchData();
          }}
        />
      </div>
    </div>
  );
}
