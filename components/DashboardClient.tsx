"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, LayoutDashboard, ArrowLeft, Trash2, X } from "lucide-react";
import AnalyticsWidget from "./dashboard/AnalyticsWidget";
import TableWidget from "./dashboard/TableWidget";
import { getTableViewData } from "@/app/actions/dashboard";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"; // Assuming this exists, if not I'll fallback to simple overlay
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Assuming this exists

// Define Types
type WidgetType = "ANALYTICS" | "TABLE";

interface DashboardWidget {
  id: string; // Unique ID for this instance on dashboard
  type: WidgetType;
  referenceId: string | number; // ID of the source (analytics view ID or table view ID)
  tableId?: number; // Only for TABLE type
}

interface DashboardClientProps {
  initialAnalytics: any[];
  availableTables: any[];
}

export default function DashboardClient({
  initialAnalytics,
  availableTables,
}: DashboardClientProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tableDataMap, setTableDataMap] = useState<Record<string, any>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WidgetType>("ANALYTICS");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<string>("");

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

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("dashboard_widgets");
    if (saved) {
      try {
        setWidgets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved dashboard", e);
      }
    } else {
      // Default: Add some analytics if available
      if (initialAnalytics.length > 0) {
        setWidgets(
          initialAnalytics.slice(0, 3).map((v) => ({
            id: `init-${Math.random()}`,
            type: "ANALYTICS",
            referenceId: v.id,
          }))
        );
      }
    }
    setIsLoaded(true);
  }, []); // Run once on mount

  // Save to LocalStorage
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("dashboard_widgets", JSON.stringify(widgets));
  }, [widgets, isLoaded]);

  // Fetch missing table data
  useEffect(() => {
    widgets.forEach(async (widget) => {
      if (widget.type === "TABLE" && widget.tableId) {
        const key = `${widget.tableId}-${widget.referenceId}`;
        if (!tableDataMap[key] && !loadingMap[key]) {
          // Fetch
          setLoadingMap((prev) => ({ ...prev, [key]: true }));
          const res = await getTableViewData(
            widget.tableId,
            Number(widget.referenceId)
          );
          setLoadingMap((prev) => ({ ...prev, [key]: false }));
          if (res.success) {
            setTableDataMap((prev) => ({ ...prev, [key]: res.data }));
          }
        }
      }
    });
  }, [widgets, tableDataMap, loadingMap]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addWidget = () => {
    if (!selectedItem) return;

    let newWidget: DashboardWidget;

    if (selectedType === "ANALYTICS") {
      newWidget = {
        id: `widget-${Date.now()}`,
        type: "ANALYTICS",
        referenceId: selectedItem,
      };
    } else {
      // Table
      if (!selectedTable) return;
      newWidget = {
        id: `widget-${Date.now()}`,
        type: "TABLE",
        referenceId: Number(selectedItem),
        tableId: Number(selectedTable),
      };
    }

    setWidgets([...widgets, newWidget]);
    setIsAddModalOpen(false);
    setSelectedItem("");
    setSelectedTable("");
  };

  const removeWidget = (id: string) => {
    setWidgets(widgets.filter((w) => w.id !== id));
  };

  // Helper to find source data
  const getWidgetContent = (widget: DashboardWidget) => {
    if (widget.type === "ANALYTICS") {
      return initialAnalytics.find((a) => a.id === widget.referenceId);
    } else {
      // For table, we need the meta from tables list + fetched data
      // For rendering title/meta, we can look at availableTables
      const table = availableTables.find((t) => t.id === widget.tableId);
      const view = table?.views?.find(
        (v: any) => v.id === Number(widget.referenceId)
      );
      const fetchedData =
        tableDataMap[`${widget.tableId}-${widget.referenceId}`];
      return {
        table,
        view,
        fetchedData,
        isLoading: loadingMap[`${widget.tableId}-${widget.referenceId}`],
      };
    }
  };

  if (!isLoaded) return <div className="p-8">טוען דאשבורד...</div>;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <LayoutDashboard className="text-blue-600" />
          הדאשבורד שלי
        </h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium text-sm"
        >
          <Plus size={16} />
          הוסף וידג׳ט
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets.map((w) => w.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {widgets.map((widget) => {
              const content = getWidgetContent(widget);

              if (widget.type === "ANALYTICS") {
                if (!content) return null; // Logic to handle missing ref
                return (
                  <AnalyticsWidget
                    key={widget.id}
                    id={widget.id}
                    view={content}
                    onRemove={() => removeWidget(widget.id)}
                  />
                );
              } else {
                const { table, view, fetchedData, isLoading } = content as any;
                if (!table || !view) return null;
                return (
                  <TableWidget
                    key={widget.id}
                    id={widget.id}
                    title={view.name}
                    tableName={table.name}
                    data={fetchedData}
                    isLoading={isLoading}
                    onRemove={() => removeWidget(widget.id)}
                  />
                );
              }
            })}

            {widgets.length === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl">
                <LayoutDashboard size={48} className="mb-4 opacity-20" />
                <p>הדאשבורד שלך ריק</p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-4 text-blue-600 font-medium hover:underline"
                >
                  לחץ כאן להוספת נתונים
                </button>
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {/* Optional: Render drag overlay for smoother visuals */}
        </DragOverlay>

        {/* Add Widget Modal Overlay */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">הוספת וידג׳ט לדאשבורד</h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    סוג מקור
                  </label>
                  <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                    <button
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                        selectedType === "ANALYTICS"
                          ? "bg-white shadow text-blue-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                      onClick={() => {
                        setSelectedType("ANALYTICS");
                        setSelectedItem("");
                      }}
                    >
                      אנליטיקות
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                        selectedType === "TABLE"
                          ? "bg-white shadow text-blue-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                      onClick={() => {
                        setSelectedType("TABLE");
                        setSelectedItem("");
                      }}
                    >
                      תצוגות טבלה
                    </button>
                  </div>
                </div>

                {/* Content Selection */}
                {selectedType === "ANALYTICS" ? (
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {initialAnalytics.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedItem(String(a.id))}
                        className={`w-full text-right p-3 hover:bg-blue-50 transition flex items-center justify-between group ${
                          selectedItem === String(a.id)
                            ? "bg-blue-50 ring-1 ring-blue-500"
                            : ""
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-800">
                            {a.ruleName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {a.tableName}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border border-gray-300 ${
                            selectedItem === String(a.id)
                              ? "bg-blue-600 border-blue-600"
                              : ""
                          }`}
                        ></div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">
                        בחר טבלה
                      </label>
                      <select
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm bg-white"
                        value={selectedTable}
                        onChange={(e) => {
                          setSelectedTable(e.target.value);
                          setSelectedItem("");
                        }}
                      >
                        <option value="">בחר...</option>
                        {availableTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTable && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                          בחר תצוגה
                        </label>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {availableTables
                            .find((t) => String(t.id) === selectedTable)
                            ?.views.map((v: any) => (
                              <button
                                key={v.id}
                                onClick={() => setSelectedItem(String(v.id))}
                                className={`w-full text-right p-3 hover:bg-blue-50 transition flex items-center justify-between ${
                                  selectedItem === String(v.id)
                                    ? "bg-blue-50 ring-1 ring-blue-500"
                                    : ""
                                }`}
                              >
                                <div className="font-medium text-gray-800">
                                  {v.name}
                                </div>
                                <div
                                  className={`w-4 h-4 rounded-full border border-gray-300 ${
                                    selectedItem === String(v.id)
                                      ? "bg-blue-600 border-blue-600"
                                      : ""
                                  }`}
                                ></div>
                              </button>
                            ))}
                          {availableTables.find(
                            (t) => String(t.id) === selectedTable
                          )?.views.length === 0 && (
                            <div className="p-3 text-center text-sm text-gray-500">
                              אין תצוגות לטבלה זו
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition"
                >
                  ביטול
                </button>
                <button
                  disabled={!selectedItem}
                  onClick={addWidget}
                  className="flex-1 py-2.5 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  הוסף לדאשבורד
                </button>
              </div>
            </div>
          </div>
        )}
      </DndContext>
    </div>
  );
}
