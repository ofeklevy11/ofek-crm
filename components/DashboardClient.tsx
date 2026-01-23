"use client";

import { useEffect, useState, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, LayoutDashboard, X, Target, Trash2 } from "lucide-react";
import AnalyticsWidget from "./dashboard/AnalyticsWidget";
import TableWidget from "./dashboard/TableWidget";
import CustomTableWidget from "./dashboard/CustomTableWidget";
import GoalWidget from "./dashboard/GoalWidget";
import AnalyticsDetailsModal from "./AnalyticsDetailsModal";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getTableViewData, getCustomTableData } from "@/app/actions/dashboard";
import {
  getDashboardWidgets,
  addDashboardWidget,
  removeDashboardWidget,
  updateDashboardWidgetOrder,
  migrateDashboardWidgets,
  updateDashboardWidgetSettings,
  updateDashboardWidget,
} from "@/app/actions/dashboard-widgets";
import { hasUserFlag, User } from "@/lib/permissions";
import { GoalWithProgress } from "@/app/actions/goals";

// Define Types
type WidgetType = "ANALYTICS" | "TABLE" | "GOAL";

interface DashboardWidget {
  id: string; // Unique ID for this instance on dashboard
  type: WidgetType;
  referenceId: string | number; // ID of the source (analytics view ID or table view ID)
  tableId?: number; // Only for TABLE type
  settings?: any;
}

interface DashboardClientProps {
  initialAnalytics: any[];
  availableTables: any[];
  availableGoals: GoalWithProgress[];
  user: User;
}

// Static metrics definition for GoalCard
const GOAL_METRICS = [
  {
    type: "REVENUE",
    name: "הכנסות",
    description: "סה״כ כסף שנכנס",
    available: true,
    icon: "💰",
  },
  {
    type: "RETAINERS",
    name: "ריטיינרים",
    description: "הכנסות חוזרות",
    available: true,
    icon: "💼",
  },
  {
    type: "LEADS",
    name: "לידים",
    description: "לקוחות חדשים",
    available: true,
    icon: "👥",
  },
  {
    type: "QUOTES",
    name: "הצעות מחיר",
    description: "הצעות וסגירות",
    available: true,
    icon: "📝",
  },
  {
    type: "TASKS",
    name: "משימות",
    description: "השלמת משימות",
    available: true,
    icon: "✅",
  },
  {
    type: "RECORDS",
    name: "רשומות",
    description: "יעדי הזנת נתונים",
    available: true,
    icon: "📊",
  },
  {
    type: "CALENDAR",
    name: "פגישות ויומן",
    description: "אירועים ביומן",
    available: true,
    icon: "📅",
  },
];

export default function DashboardClient({
  initialAnalytics,
  availableTables,
  availableGoals,
  user,
}: DashboardClientProps) {
  // State
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    widgetId: string;
    widgetTitle: string;
  }>({
    isOpen: false,
    widgetId: "",
    widgetTitle: "",
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WidgetType>("ANALYTICS");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedItem, setSelectedItem] = useState("");

  // Custom Table State
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Analytics Details Modal State
  const [selectedView, setSelectedView] = useState<any | null>(null);

  // Data State for Table Widgets
  const [tableData, setTableData] = useState<Record<string, any>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});

  // Permissions
  const canViewDashboard = hasUserFlag(user, "canViewDashboard");
  // Default to true if user can view dashboard, they can customize their own dashboard
  const canAddWidget = canViewDashboard;

  // Track initialization to prevent duplicate loading
  const isInitialized = useRef(false);

  // Load widgets from database on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    async function loadWidgets() {
      // First, try to migrate any existing localStorage widgets
      const saved = localStorage.getItem("dashboard_widgets");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrationData = parsed.map((w: any) => ({
              widgetType: w.type as "ANALYTICS" | "TABLE",
              referenceId: String(w.referenceId),
              tableId: w.tableId,
            }));
            const migrationRes = await migrateDashboardWidgets(migrationData);
            if (migrationRes.success && migrationRes.migrated) {
              // Clear localStorage after successful migration
              localStorage.removeItem("dashboard_widgets");
            }
          }
        } catch (e) {
          console.error("Failed to migrate widgets", e);
        }
      }

      // Load widgets from database
      const res = await getDashboardWidgets();
      if (res.success && res.data) {
        const dbWidgets: DashboardWidget[] = res.data.map((w: any) => ({
          id: w.id,
          type: w.widgetType as WidgetType,
          referenceId: w.referenceId,
          tableId: w.tableId,
          settings: w.settings || undefined,
        }));
        setWidgets(dbWidgets);
      }
    }

    loadWidgets();
  }, []);

  // Fetch data for table widgets
  useEffect(() => {
    widgets.forEach((widget) => {
      if (widget.type === "TABLE" && widget.tableId && widget.referenceId) {
        // Skip fetching if the widget is collapsed
        if (widget.settings?.collapsed) return;

        if (!tableData[widget.id] && !tableLoading[widget.id]) {
          fetchTableData(
            widget.id,
            widget.tableId,
            widget.referenceId,
            (widget as any).settings, // pass settings
          );
        }
      }
    });
  }, [widgets]);

  const fetchTableData = async (
    widgetId: string,
    tableId: number,
    viewId: number | string,
    settings?: any,
  ) => {
    setTableLoading((prev) => ({ ...prev, [widgetId]: true }));
    try {
      let res;
      if (typeof viewId === "string" && viewId === "custom") {
        res = await getCustomTableData(tableId, settings || {});
      } else {
        res = await getTableViewData(
          tableId,
          typeof viewId === "string" ? Number(viewId) : viewId,
        );
      }

      if (res.success && res.data) {
        setTableData((prev) => ({ ...prev, [widgetId]: res.data }));
      }
    } catch (err) {
      console.error("Error fetching table data", err);
    } finally {
      setTableLoading((prev) => ({ ...prev, [widgetId]: false }));
    }
  };

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

  const handleDragStart = (event: DragStartEvent) => {
    // setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update order in database
        updateDashboardWidgetOrder(newItems.map((w) => w.id));

        return newItems;
      });
    }
  };

  const handleEditWidget = (widget: DashboardWidget) => {
    setEditingWidgetId(widget.id);
    setSelectedType(widget.type);
    if (widget.type === "TABLE" && widget.tableId) {
      setSelectedTable(String(widget.tableId));
      if (String(widget.referenceId) === "custom") {
        setIsCustomMode(true);

        // Try to get columns from settings, fallback to loaded data if available
        let initialCols = widget.settings?.columns;

        if (
          !initialCols ||
          !Array.isArray(initialCols) ||
          initialCols.length === 0
        ) {
          const loadedData = tableData[widget.id];
          if (
            loadedData?.data?.columns &&
            Array.isArray(loadedData.data.columns)
          ) {
            initialCols = loadedData.data.columns.map((c: any) => c.name);
          }
        }

        setSelectedColumns(initialCols || []);
        setSelectedItem("custom");
      } else {
        setIsCustomMode(false);
        setSelectedItem(String(widget.referenceId));
      }
    } else {
      setSelectedItem(String(widget.referenceId));
    }
    setIsAddModalOpen(true);
  };

  const handleAddWidget = async () => {
    if (!selectedItem) return;

    if (editingWidgetId) {
      const settings = isCustomMode
        ? {
            columns: selectedColumns,
            limit: 10,
            sort: "desc",
          }
        : undefined;

      const res = await updateDashboardWidget(editingWidgetId, {
        referenceId: isCustomMode ? "custom" : selectedItem,
        settings: settings,
      });

      if (res.success) {
        setWidgets((prev) =>
          prev.map((w) =>
            w.id === editingWidgetId
              ? {
                  ...w,
                  referenceId: isCustomMode ? "custom" : selectedItem,
                  settings,
                }
              : w,
          ),
        );
        // Refresh data
        if (selectedType === "TABLE" && selectedTable) {
          fetchTableData(
            editingWidgetId,
            Number(selectedTable),
            isCustomMode ? "custom" : selectedItem,
            settings,
          );
        }
      }
    } else {
      const widgetData = {
        widgetType: selectedType,
        referenceId: isCustomMode ? "custom" : selectedItem,
        tableId: selectedType === "TABLE" ? Number(selectedTable) : undefined,
        settings: isCustomMode
          ? {
              columns: selectedColumns,
              limit: 10,
              sort: "desc",
            }
          : undefined,
      };

      // Add to database
      // @ts-ignore
      const res = await addDashboardWidget(widgetData);
      if (res.success && res.data) {
        const newWidget: DashboardWidget = {
          id: res.data.id,
          type: res.data.widgetType as WidgetType,
          referenceId: res.data.referenceId || "custom",
          tableId: res.data.tableId ?? undefined,
          settings: res.data.settings,
        };
        setWidgets([...widgets, newWidget]);
      }
    }

    setIsAddModalOpen(false);
    setEditingWidgetId(null);
    setSelectedItem("");
    setSelectedTable("");
    setIsCustomMode(false);
    setSelectedColumns([]);
  };

  const handleRemoveWidget = (widget: DashboardWidget) => {
    // Get the title for verification
    const content = getWidgetContent(widget);
    let title = "וידג׳ט";
    if (widget.type === "ANALYTICS") {
      title = (content as any)?.ruleName || "אנליטיקה";
    } else if (widget.type === "GOAL") {
      title = (content as any)?.name || "יעד";
    } else {
      const { view } = content as any;
      title = view?.name || "טבלה";
    }

    setDeleteModal({
      isOpen: true,
      widgetId: widget.id,
      widgetTitle: title,
    });
  };

  const confirmRemoveWidget = async () => {
    const { widgetId } = deleteModal;
    if (!widgetId) return;

    // Remove from database
    const res = await removeDashboardWidget(widgetId);
    if (res.success) {
      setWidgets(widgets.filter((w) => w.id !== widgetId));
      // Clean up data
      const newData = { ...tableData };
      delete newData[widgetId];
      setTableData(newData);
    }
    setDeleteModal({ isOpen: false, widgetId: "", widgetTitle: "" });
  };

  const getWidgetContent = (widget: DashboardWidget) => {
    if (widget.type === "ANALYTICS") {
      const view = initialAnalytics.find(
        (a) => String(a.id) === String(widget.referenceId),
      );
      return view;
    } else if (widget.type === "GOAL") {
      const goal = availableGoals.find(
        (g) => String(g.id) === String(widget.referenceId),
      );
      return goal;
    } else {
      // TABLE
      const table = availableTables.find((t) => t.id === widget.tableId);
      let view;
      if (String(widget.referenceId) === "custom") {
        view = { name: "תצוגה מותאמת אישית", id: "custom" };
      } else {
        view = table?.views.find(
          (v: any) => String(v.id) === String(widget.referenceId),
        );
      }

      const fetchedData = tableData[widget.id] || [];
      const isLoading = tableLoading[widget.id];
      return { table, view, fetchedData, isLoading };
    }
  };

  const handleOpenAddModal = () => {
    setEditingWidgetId(null);
    setSelectedType("ANALYTICS");
    setSelectedTable("");
    setSelectedItem("");
    setIsCustomMode(false);
    setSelectedColumns([]);
    setIsAddModalOpen(true);
  };

  const hasTables = availableTables.length > 0;
  // const hasGoals = availableGoals.length > 0; // Not explicitly used but good context

  const handleWidgetSettingsChange = (widgetId: string, newSettings: any) => {
    // 1. Update local widgets state
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === widgetId ? { ...w, settings: newSettings } : w,
      ),
    );

    // 2. Fetch data with new settings directly
    const widget = widgets.find((w) => w.id === widgetId);
    if (widget && widget.type === "TABLE" && widget.tableId) {
      if (newSettings?.collapsed) return;
      fetchTableData(widgetId, widget.tableId, widget.referenceId, newSettings);
    }
  };

  if (!canViewDashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          אין לך גישה לדאשבורד
        </h2>
        <p className="text-gray-500">
          אנא פנה למנהל המערכת לקבלת הרשאות מתאימות
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <LayoutDashboard className="text-blue-600" />
          הדאשבורד שלי
        </h2>
        {canViewDashboard && (
          <button
            onClick={handleOpenAddModal}
            disabled={!canAddWidget}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition shadow-sm font-medium text-sm ${
              !canAddWidget
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-blue-700"
            }`}
          >
            <Plus size={16} />
            הוסף וידג׳ט
          </button>
        )}
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
          <div className="columns-1 sm:columns-2 gap-6 space-y-6">
            {widgets.map((widget) => {
              const content = getWidgetContent(widget);

              if (widget.type === "ANALYTICS") {
                if (!content) return null;
                const view = content as any;
                const isGraph = view.type === "GRAPH";
                return (
                  <div key={widget.id} className="break-inside-avoid">
                    <AnalyticsWidget
                      id={widget.id}
                      view={view}
                      onRemove={() => handleRemoveWidget(widget)}
                      onOpenDetails={(view) => setSelectedView(view)}
                      onEdit={() => handleEditWidget(widget)}
                      settings={(widget as any).settings}
                      onSettingsChange={(newSettings) =>
                        handleWidgetSettingsChange(widget.id, newSettings)
                      }
                    />
                  </div>
                );
              } else if (widget.type === "GOAL") {
                if (!content) return null;
                const goal = content as GoalWithProgress;
                return (
                  <div key={widget.id} className="break-inside-avoid">
                    <GoalWidget
                      id={widget.id}
                      goal={goal}
                      metrics={GOAL_METRICS}
                      tables={availableTables}
                      onRemove={() => handleRemoveWidget(widget)}
                    />
                  </div>
                );
              } else {
                const { table, view, fetchedData, isLoading } = content as any;
                if (!table || !view) return null;

                const isCustom = String(widget.referenceId) === "custom";

                // If custom table, render the wide CustomTableWidget
                if (isCustom) {
                  return (
                    <div
                      key={widget.id}
                      className={`break-inside-avoid ${(widget as any).settings?.collapsed ? "" : "min-h-[400px]"}`}
                    >
                      <CustomTableWidget
                        id={widget.id}
                        title={view.name}
                        tableName={table.name}
                        tableId={table.id}
                        data={fetchedData}
                        isLoading={isLoading}
                        onRemove={() => handleRemoveWidget(widget)}
                        onEdit={() => handleEditWidget(widget)}
                        settings={(widget as any).settings}
                        onSettingsChange={(newSettings) =>
                          handleWidgetSettingsChange(widget.id, newSettings)
                        }
                      />
                    </div>
                  );
                }

                return (
                  <div key={widget.id} className="break-inside-avoid">
                    <TableWidget
                      id={widget.id}
                      title={view.name}
                      tableName={table.name}
                      data={fetchedData}
                      isLoading={isLoading}
                      onRemove={() => handleRemoveWidget(widget)}
                      onEdit={() => handleEditWidget(widget)}
                      settings={(widget as any).settings}
                      onSettingsChange={(newSettings) =>
                        handleWidgetSettingsChange(widget.id, newSettings)
                      }
                    />
                  </div>
                );
              }
            })}

            {widgets.length === 0 && (
              <div className="w-full py-16 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-3xl text-center px-4">
                <LayoutDashboard size={64} className="mb-6 opacity-10" />

                {!canAddWidget ? (
                  <div className="max-w-lg space-y-2">
                    <p className="text-gray-500 font-medium">
                      על מנת להוסיף ווידגט ללוח הבקרה תצטרכו ליצור תצוגה בתוך
                      טבלה או אנליטיקה בעמוד "אנליטיקות"
                    </p>
                  </div>
                ) : (
                  <>
                    <p>הדאשבורד שלך ריק</p>
                    <button
                      onClick={handleOpenAddModal}
                      className="mt-4 text-blue-600 font-medium hover:underline"
                    >
                      לחץ כאן להוספת נתונים
                    </button>
                  </>
                )}
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
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">
                  {editingWidgetId ? "עריכת וידג׳ט" : "הוספת וידג׳ט לדאשבורד"}
                </h3>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingWidgetId(null);
                  }}
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
                      } ${editingWidgetId ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (editingWidgetId) return;
                        setSelectedType("ANALYTICS");
                        setSelectedItem("");
                      }}
                      disabled={!!editingWidgetId}
                    >
                      אנליטיקות
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                        selectedType === "GOAL"
                          ? "bg-white shadow text-blue-600"
                          : "text-gray-500 hover:text-gray-700"
                      } ${editingWidgetId ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (editingWidgetId) return;
                        setSelectedType("GOAL");
                        setSelectedItem("");
                      }}
                      disabled={!!editingWidgetId}
                    >
                      יעדים
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                        selectedType === "TABLE"
                          ? "bg-white shadow text-blue-600"
                          : "text-gray-500 hover:text-gray-700"
                      } ${editingWidgetId ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (editingWidgetId) return;
                        setSelectedType("TABLE");
                        setSelectedItem("");
                      }}
                      disabled={!!editingWidgetId}
                    >
                      תצוגות טבלה
                    </button>
                    {/* Reset custom mode when switching types just in case, though state logic handles it */}
                  </div>
                </div>

                {/* Content Selection */}
                {selectedType === "ANALYTICS" && (
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
                    {initialAnalytics.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-500">
                        לא נמצאו אנליטיקות זמינות.
                      </div>
                    )}
                  </div>
                )}

                {selectedType === "GOAL" && (
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {availableGoals.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setSelectedItem(String(g.id))}
                        className={`w-full text-right p-3 hover:bg-blue-50 transition flex items-center justify-between group ${
                          selectedItem === String(g.id)
                            ? "bg-blue-50 ring-1 ring-blue-500"
                            : ""
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-800">
                            {g.name}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {g.metricType}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border border-gray-300 ${
                            selectedItem === String(g.id)
                              ? "bg-blue-600 border-blue-600"
                              : ""
                          }`}
                        ></div>
                      </button>
                    ))}
                    {availableGoals.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-500">
                        לא נמצאו יעדים זמינים.
                      </div>
                    )}
                  </div>
                )}

                {selectedType === "TABLE" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">
                        בחר טבלה
                      </label>
                      <select
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm bg-white disabled:opacity-50 disabled:bg-gray-100"
                        value={selectedTable}
                        onChange={(e) => {
                          setSelectedTable(e.target.value);
                          setSelectedItem("");
                        }}
                        disabled={!!editingWidgetId}
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
                        {!editingWidgetId && (
                          <div className="flex gap-2 mb-3 bg-gray-50 p-1 rounded-lg">
                            <button
                              className={`flex-1 text-xs py-1.5 font-medium rounded-md transition ${
                                !isCustomMode
                                  ? "bg-white shadow text-blue-600"
                                  : "text-gray-500 hover:text-gray-700"
                              }`}
                              onClick={() => {
                                setIsCustomMode(false);
                                setSelectedItem("");
                              }}
                            >
                              תצוגות שמורות
                            </button>
                            <button
                              className={`flex-1 text-xs py-1.5 font-medium rounded-md transition ${
                                isCustomMode
                                  ? "bg-white shadow text-blue-600"
                                  : "text-gray-500 hover:text-gray-700"
                              }`}
                              onClick={() => {
                                setIsCustomMode(true);
                                setSelectedItem("custom"); // Mark as selected so "Add" button works
                                // Default columns? maybe select all or first 5
                              }}
                            >
                              תצוגה מותאמת
                            </button>
                          </div>
                        )}

                        {!isCustomMode ? (
                          <>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                              בחר תצוגה
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                              {availableTables
                                .find((t) => String(t.id) === selectedTable)
                                ?.views.map((v: any) => (
                                  <button
                                    key={v.id}
                                    onClick={() =>
                                      setSelectedItem(String(v.id))
                                    }
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
                                (t) => String(t.id) === selectedTable,
                              )?.views.length === 0 && (
                                <div className="p-3 text-center text-sm text-gray-500">
                                  אין תצוגות לטבלה זו
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">
                                בחר עמודות (מקסימום 7)
                              </label>
                              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                                {(
                                  (availableTables.find(
                                    (t) => String(t.id) === selectedTable,
                                  )?.schemaJson as any) || []
                                ).map((field: any) => (
                                  <label
                                    key={field.name}
                                    className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      checked={selectedColumns.includes(
                                        field.name,
                                      )}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          if (selectedColumns.length >= 7)
                                            return;
                                          setSelectedColumns([
                                            ...selectedColumns,
                                            field.name,
                                          ]);
                                        } else {
                                          setSelectedColumns(
                                            selectedColumns.filter(
                                              (c) => c !== field.name,
                                            ),
                                          );
                                        }
                                      }}
                                      disabled={
                                        !selectedColumns.includes(field.name) &&
                                        selectedColumns.length >= 7
                                      }
                                    />
                                    <span className="text-sm text-gray-700">
                                      {field.label || field.name}
                                    </span>
                                  </label>
                                ))}
                                {/* Add System Columns */}
                                {[
                                  { name: "createdAt", label: "נוצר בתאריך" },
                                  { name: "updatedAt", label: "עודכן בתאריך" },
                                  { name: "createdBy", label: "נוצר על ידי" },
                                  { name: "updatedBy", label: "עודכן על ידי" },
                                ].map((field: any) => (
                                  <label
                                    key={field.name}
                                    className="flex items-center gap-2 p-1.5 hover:bg-gray-100/50 rounded cursor-pointer border-t border-dashed border-gray-100 first:border-0"
                                  >
                                    <input
                                      type="checkbox"
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      checked={selectedColumns.includes(
                                        field.name,
                                      )}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          if (selectedColumns.length >= 7)
                                            return;
                                          setSelectedColumns([
                                            ...selectedColumns,
                                            field.name,
                                          ]);
                                        } else {
                                          setSelectedColumns(
                                            selectedColumns.filter(
                                              (c) => c !== field.name,
                                            ),
                                          );
                                        }
                                      }}
                                      disabled={
                                        !selectedColumns.includes(field.name) &&
                                        selectedColumns.length >= 7
                                      }
                                    />
                                    <span className="text-sm text-gray-500 italic">
                                      {field.label}
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                נבחרו: {selectedColumns.length}/7
                              </p>
                            </div>

                            <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded text-center">
                              התצוגה תהיה ממוינת מהחדש לישן ותציג 10 רשומות
                              אחרונות.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingWidgetId(null);
                  }}
                  className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition"
                >
                  ביטול
                </button>
                <button
                  disabled={
                    !selectedItem ||
                    (isCustomMode && selectedColumns.length === 0)
                  }
                  onClick={handleAddWidget}
                  className="flex-1 py-2.5 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingWidgetId ? "שמור שינויים" : "הוסף לדאשבורד"}
                </button>
              </div>
            </div>
          </div>
        )}
      </DndContext>

      {/* Analytics Details Modal */}
      <AnalyticsDetailsModal
        isOpen={!!selectedView}
        onClose={() => setSelectedView(null)}
        title={selectedView?.ruleName || "פרטי אנליטיקה"}
        tableName={selectedView?.tableName || ""}
        data={selectedView?.data || []}
      />
      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() =>
          setDeleteModal({ isOpen: false, widgetId: "", widgetTitle: "" })
        }
        onConfirm={confirmRemoveWidget}
        widgetTitle={deleteModal.widgetTitle}
      />
    </div>
  );
}
