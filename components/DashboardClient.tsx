"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
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
import {
  Plus,
  LayoutDashboard,
  X,
  Target,
  Trash2,
  LayoutGrid,
  BarChart3,
  Calendar,
  CheckSquare,
  FileText,
} from "lucide-react";
import AnalyticsWidget from "./dashboard/AnalyticsWidget";
import TableWidget from "./dashboard/TableWidget";
import CustomTableWidget from "./dashboard/CustomTableWidget";
import GoalWidget from "./dashboard/GoalWidget";
import TableViewsDashboardWidget from "./dashboard/TableViewsDashboardWidget";
import GoalsTableWidget from "./dashboard/GoalsTableWidget";
import AnalyticsTableWidget from "./dashboard/AnalyticsTableWidget";
import MiniCalendarWidget from "./dashboard/MiniCalendarWidget";
import MiniTasksWidget from "./dashboard/MiniTasksWidget";
import MiniQuotesWidget from "./dashboard/MiniQuotesWidget";
import MiniMeetingsWidget from "./dashboard/MiniMeetingsWidget";
import MiniWidgetConfigModal from "./dashboard/MiniWidgetConfigModal";
import AnalyticsDetailsModal from "./AnalyticsDetailsModal";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { getTableViewData, getCustomTableData, getBatchTableData } from "@/app/actions/dashboard";
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
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

// Define Types
type WidgetType =
  | "ANALYTICS"
  | "TABLE"
  | "GOAL"
  | "TABLE_VIEWS_DASHBOARD"
  | "GOALS_TABLE"
  | "ANALYTICS_TABLE"
  | "MINI_CALENDAR"
  | "MINI_TASKS"
  | "MINI_QUOTES"
  | "MINI_MEETINGS";

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
    type: "CUSTOMERS",
    name: "לקוחות",
    description: "לקוחות חדשים (מעמוד כספים)",
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

  const [isWidgetsLoaded, setIsWidgetsLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Mini Widget Config Modal State
  const [miniConfigModal, setMiniConfigModal] = useState<{
    open: boolean;
    widgetType: "MINI_CALENDAR" | "MINI_TASKS" | "MINI_QUOTES" | "MINI_MEETINGS";
    editWidgetId?: string;
    currentSettings?: any;
  } | null>(null);

  // Custom Table State
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Analytics Details Modal State
  const [selectedView, setSelectedView] = useState<any | null>(null);

  // Live announcement for screen readers
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Data State for Table Widgets
  const [tableData, setTableData] = useState<Record<string, any>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});

  // Refs for stable callback access (avoids stale closures in useCallback)
  const widgetsRef = useRef<DashboardWidget[]>(widgets);
  widgetsRef.current = widgets;
  const tableDataRef = useRef<Record<string, any>>(tableData);
  tableDataRef.current = tableData;

  // Mini Dashboard (Table Views Dashboard) State
  const [isMiniDashboardModalOpen, setIsMiniDashboardModalOpen] =
    useState(false);
  const [miniDashboardTitle, setMiniDashboardTitle] = useState("מיני דאשבורד");
  const [miniDashboardViews, setMiniDashboardViews] = useState<
    Array<{
      tableId: number;
      viewId: number;
      tableName?: string;
      viewName?: string;
      colorIndex?: number;
    }>
  >([]);
  const [editingMiniDashboardId, setEditingMiniDashboardId] = useState<
    string | null
  >(null);

  // Goals Table State
  const [isGoalsTableModalOpen, setIsGoalsTableModalOpen] = useState(false);
  const [goalsTableTitle, setGoalsTableTitle] = useState("טבלת יעדים");
  const [goalsTableSelectedIds, setGoalsTableSelectedIds] = useState<string[]>(
    [],
  );
  const [editingGoalsTableId, setEditingGoalsTableId] = useState<string | null>(
    null,
  );

  // Goals Table Logic
  const handleOpenGoalsTableModal = () => {
    setEditingGoalsTableId(null);
    setGoalsTableTitle("טבלת יעדים");
    setGoalsTableSelectedIds([]);
    setIsGoalsTableModalOpen(true);
  };

  const handleEditGoalsTableById = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget) return;
    setEditingGoalsTableId(widget.id);
    setGoalsTableTitle(widget.settings?.title || "טבלת יעדים");
    setGoalsTableSelectedIds(widget.settings?.goalIds || []);
    setIsGoalsTableModalOpen(true);
  }, []);

  const handleAddGoalsTable = async () => {
    if (!goalsTableTitle) return;
    setActionLoading("goalsTable");
    try {
      const settings = {
        title: goalsTableTitle,
        goalIds: goalsTableSelectedIds,
        collapsed: false,
      };

      if (editingGoalsTableId) {
        const res = await updateDashboardWidget(editingGoalsTableId, {
          settings,
        });
        if (res.success) {
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === editingGoalsTableId ? { ...w, settings } : w,
            ),
          );
        }
      } else {
        // @ts-ignore
        const res = await addDashboardWidget({
          widgetType: "GOALS_TABLE",
          referenceId: "custom",
          settings,
        });
        if (res.success && res.data) {
          const newWidget: DashboardWidget = {
            id: res.data.id,
            type: res.data.widgetType as WidgetType,
            referenceId: res.data.referenceId || "custom",
            settings: res.data.settings,
          };
          setWidgets((prev) => [...prev, newWidget]);
        }
      }

      setIsGoalsTableModalOpen(false);
      setEditingGoalsTableId(null);
      setGoalsTableSelectedIds([]);
      setGoalsTableTitle("");
    } finally {
      setActionLoading(null);
    }
  };

  // Analytics Table Logic
  const [isAnalyticsTableModalOpen, setIsAnalyticsTableModalOpen] =
    useState(false);
  const [analyticsTableTitle, setAnalyticsTableTitle] =
    useState("טבלת אנליטיקות");
  const [analyticsTableSelectedIds, setAnalyticsTableSelectedIds] = useState<
    string[]
  >([]);
  const [editingAnalyticsTableId, setEditingAnalyticsTableId] = useState<
    string | null
  >(null);

  const handleOpenAnalyticsTableModal = () => {
    setEditingAnalyticsTableId(null);
    setAnalyticsTableTitle("טבלת אנליטיקות");
    setAnalyticsTableSelectedIds([]);
    setIsAnalyticsTableModalOpen(true);
  };

  const handleEditAnalyticsTableById = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget) return;
    setEditingAnalyticsTableId(widget.id);
    setAnalyticsTableTitle(widget.settings?.title || "טבלת אנליטיקות");
    setAnalyticsTableSelectedIds(widget.settings?.analyticsIds || []);
    setIsAnalyticsTableModalOpen(true);
  }, []);

  const handleAddAnalyticsTable = async () => {
    if (!analyticsTableTitle) return;
    setActionLoading("analyticsTable");
    try {
      const settings = {
        title: analyticsTableTitle,
        analyticsIds: analyticsTableSelectedIds,
        collapsed: false,
      };

      if (editingAnalyticsTableId) {
        const res = await updateDashboardWidget(editingAnalyticsTableId, {
          settings,
        });
        if (res.success) {
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === editingAnalyticsTableId ? { ...w, settings } : w,
            ),
          );
        }
      } else {
        // @ts-ignore
        const res = await addDashboardWidget({
          widgetType: "ANALYTICS_TABLE",
          referenceId: "custom",
          settings,
        });
        if (res.success && res.data) {
          const newWidget: DashboardWidget = {
            id: res.data.id,
            type: res.data.widgetType as WidgetType,
            referenceId: res.data.referenceId || "custom",
            settings: res.data.settings,
          };
          setWidgets((prev) => [...prev, newWidget]);
        }
      }

      setIsAnalyticsTableModalOpen(false);
      setEditingAnalyticsTableId(null);
      setAnalyticsTableSelectedIds([]);
      setAnalyticsTableTitle("");
    } finally {
      setActionLoading(null);
    }
  };

  // Mini widget handlers — open config modal instead of adding immediately
  const handleAddMiniCalendar = () => {
    setMiniConfigModal({ open: true, widgetType: "MINI_CALENDAR" });
  };

  const handleAddMiniTasks = () => {
    setMiniConfigModal({ open: true, widgetType: "MINI_TASKS" });
  };

  const handleAddMiniQuotes = () => {
    setMiniConfigModal({ open: true, widgetType: "MINI_QUOTES" });
  };

  const handleAddMiniMeetings = () => {
    setMiniConfigModal({ open: true, widgetType: "MINI_MEETINGS" });
  };


  const handleMiniConfigConfirm = async (settings: any) => {
    if (!miniConfigModal) return;
    setActionLoading("miniConfig");
    try {
      const { widgetType, editWidgetId } = miniConfigModal;

      if (editWidgetId) {
        // Edit existing widget settings
        const res = await updateDashboardWidgetSettings(editWidgetId, settings);
        if (res.success) {
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === editWidgetId ? { ...w, settings } : w,
            ),
          );
        }
      } else {
        // Add new widget with chosen settings
        // @ts-ignore
        const res = await addDashboardWidget({
          widgetType,
          referenceId: "custom",
          settings,
        });
        if (res.success && res.data) {
          setWidgets((prev) => [
            ...prev,
            {
              id: res.data.id,
              type: res.data.widgetType as WidgetType,
              referenceId: res.data.referenceId || "custom",
              settings: res.data.settings,
            },
          ]);
        }
      }

      setMiniConfigModal(null);
    } finally {
      setActionLoading(null);
    }
  };

  // Stable ID-based handler — uses ref to look up widget type/settings
  const handleOpenMiniWidgetSettingsById = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget) return;
    setMiniConfigModal({
      open: true,
      widgetType: widget.type as "MINI_CALENDAR" | "MINI_TASKS" | "MINI_QUOTES" | "MINI_MEETINGS",
      editWidgetId: widgetId,
      currentSettings: widget.settings,
    });
  }, []);

  // Permissions
  const canViewDashboard = hasUserFlag(user, "canViewDashboard");
  // Default to true if user can view dashboard, they can customize their own dashboard
  const canAddWidget = canViewDashboard;

  // C1: Build O(1) lookup Maps from props to avoid .find() in render loop
  const analyticsMap = useMemo(
    () => new Map(initialAnalytics.map((a) => [String(a.id), a])),
    [initialAnalytics],
  );
  const goalsMap = useMemo(
    () => new Map(availableGoals.map((g) => [String(g.id), g])),
    [availableGoals],
  );
  const tablesMap = useMemo(
    () => new Map(availableTables.map((t) => [t.id, t])),
    [availableTables],
  );

  // Track initialization to prevent duplicate loading
  const isInitialized = useRef(false);

  // Per-widget cooldown to prevent cache-bypass spam (5s cooldown)
  // Tracks both time and settings key so settings changes bypass cooldown
  const lastFetchTime = useRef<Record<string, { time: number; settingsKey: string }>>({});
  const FETCH_COOLDOWN_MS = 5000;

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
          toast.error(getUserFriendlyError(e));
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
      setIsWidgetsLoaded(true);
    }

    loadWidgets();
  }, []);

  // C2: Derive a stable key that only changes when TABLE widget IDs/referenceIds change
  const pendingTableWidgetKey = useMemo(() => {
    return widgets
      .filter((w) => w.type === "TABLE" && w.tableId && w.referenceId && !w.settings?.collapsed)
      .map((w) => `${w.id}:${w.tableId}:${w.referenceId}`)
      .join("|");
  }, [widgets]);

  // Fetch data for table widgets (batched to avoid N+1)
  useEffect(() => {
    const pending = widgets.filter(
      (w) =>
        w.type === "TABLE" &&
        w.tableId &&
        w.referenceId &&
        !w.settings?.collapsed &&
        !tableData[w.id] &&
        !tableLoading[w.id],
    );

    if (pending.length === 0) return;

    // Mark all pending widgets as loading
    setTableLoading((prev) => {
      const next = { ...prev };
      pending.forEach((w) => { next[w.id] = true; });
      return next;
    });

    // Single batched server action call
    getBatchTableData(
      pending.map((w) => ({
        widgetId: w.id,
        tableId: w.tableId!,
        viewId: w.referenceId!,
        settings: (w as any).settings,
      })),
    )
      .then((res) => {
        if (res.success && res.results) {
          setTableData((prev) => {
            const next = { ...prev };
            for (const r of res.results!) {
              if (r.success && r.data) {
                next[r.widgetId] = r.data;
              }
            }
            return next;
          });
        }
      })
      .catch((err) => {
        console.error("Error fetching batch table data", err);
        toast.error(getUserFriendlyError(err));
      })
      .finally(() => {
        setTableLoading((prev) => {
          const next = { ...prev };
          pending.forEach((w) => { next[w.id] = false; });
          return next;
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTableWidgetKey]);

  const fetchTableData = useCallback(async (
    widgetId: string,
    tableId: number,
    viewId: number | string,
    settings?: any,
  ) => {
    // Per-widget cooldown — only throttle identical settings requests
    const now = Date.now();
    const settingsKey = JSON.stringify(settings || {});
    const lastEntry = lastFetchTime.current[widgetId];
    if (lastEntry && now - lastEntry.time < FETCH_COOLDOWN_MS && lastEntry.settingsKey === settingsKey) {
      return;
    }
    lastFetchTime.current[widgetId] = { time: now, settingsKey };

    setTableLoading((prev) => ({ ...prev, [widgetId]: true }));
    try {
      let res;
      if (typeof viewId === "string" && viewId === "custom") {
        res = await getCustomTableData(tableId, settings || {}, true);
      } else {
        res = await getTableViewData(
          tableId,
          typeof viewId === "string" ? Number(viewId) : viewId,
          true,
        );
      }

      if (res.success && res.data) {
        setTableData((prev) => ({ ...prev, [widgetId]: res.data }));
      }
    } catch (err) {
      console.error("Error fetching table data", err);
      toast.error(getUserFriendlyError(err));
    } finally {
      setTableLoading((prev) => ({ ...prev, [widgetId]: false }));
    }
  }, []);

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

  // C5: Move server action out of state updater; C4: wrap in useCallback
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      let newOrder: string[] | undefined;
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        newOrder = newItems.map((w) => w.id);
        return newItems;
      });

      // Persist order to database after state update
      if (newOrder) {
        try {
          await updateDashboardWidgetOrder(newOrder);
        } catch (err) {
          toast.error(getUserFriendlyError(err));
        }
      }
    }
  }, []);

  // Stable ID-based edit handler — uses refs to avoid stale closures
  const handleEditWidgetById = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget) return;
    setEditingWidgetId(widget.id);
    setSelectedType(widget.type);
    if (widget.type === "TABLE" && widget.tableId) {
      setSelectedTable(String(widget.tableId));
      setIsCustomMode(true);
      setSelectedItem("custom");

      let initialCols = widget.settings?.columns;
      if (!initialCols || !Array.isArray(initialCols) || initialCols.length === 0) {
        const loadedData = tableDataRef.current[widget.id];
        if (loadedData?.data?.columns && Array.isArray(loadedData.data.columns)) {
          initialCols = loadedData.data.columns.map((c: any) => c.name);
        }
      }
      setSelectedColumns(initialCols || []);
    } else {
      setSelectedItem(String(widget.referenceId));
    }
    setIsAddModalOpen(true);
  }, []);

  const handleAddWidget = async () => {
    if (!selectedItem) return;
    setActionLoading("addWidget");
    try {
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
        setWidgets((prev) => [...prev, newWidget]);
      }
    }

    setIsAddModalOpen(false);
    setEditingWidgetId(null);
    if (!editingWidgetId) {
      setLiveAnnouncement('');
      requestAnimationFrame(() => setLiveAnnouncement("ווידג׳ט חדש נוסף לדאשבורד"));
    }
    setSelectedItem("");
    setSelectedTable("");
    setIsCustomMode(false);
    setSelectedColumns([]);
    } finally {
      setActionLoading(null);
    }
  };

  // C1: Use Map.get() instead of .find() for O(1) lookups; C4: wrap in useCallback
  const getWidgetContent = useCallback((widget: DashboardWidget) => {
    if (widget.type === "ANALYTICS") {
      return analyticsMap.get(String(widget.referenceId));
    } else if (widget.type === "GOAL") {
      return goalsMap.get(String(widget.referenceId));
    } else if (widget.type === "TABLE_VIEWS_DASHBOARD") {
      return widget.settings;
    } else if (widget.type === "GOALS_TABLE") {
      return widget.settings;
    } else if (widget.type === "ANALYTICS_TABLE") {
      return widget.settings;
    } else if (widget.type === "MINI_CALENDAR" || widget.type === "MINI_TASKS" || widget.type === "MINI_QUOTES" || widget.type === "MINI_MEETINGS") {
      return null;
    } else {
      // TABLE
      const table = tablesMap.get(widget.tableId!);
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
  }, [analyticsMap, goalsMap, tablesMap, tableData, tableLoading]);

  // C8: Lightweight title extraction without full content lookup
  const getWidgetTitle = useCallback((widget: DashboardWidget): string => {
    if (widget.type === "ANALYTICS") {
      const view = analyticsMap.get(String(widget.referenceId));
      return view?.ruleName || "אנליטיקה";
    } else if (widget.type === "GOAL") {
      const goal = goalsMap.get(String(widget.referenceId));
      return goal?.name || "יעד";
    } else if (widget.type === "TABLE_VIEWS_DASHBOARD") {
      return widget.settings?.title || "מיני דאשבורד";
    } else if (widget.type === "GOALS_TABLE") {
      return widget.settings?.title || "טבלת יעדים";
    } else if (widget.type === "ANALYTICS_TABLE") {
      return widget.settings?.title || "טבלת אנליטיקות";
    } else if (widget.type === "MINI_CALENDAR") {
      return "מיני יומן";
    } else if (widget.type === "MINI_TASKS") {
      return "מיני משימות";
    } else if (widget.type === "MINI_QUOTES") {
      return "מיני הצעות מחיר";
    } else if (widget.type === "MINI_MEETINGS") {
      return "מיני פגישות";
    } else {
      const table = tablesMap.get(widget.tableId!);
      if (String(widget.referenceId) === "custom") return "תצוגה מותאמת אישית";
      const view = table?.views.find((v: any) => String(v.id) === String(widget.referenceId));
      return view?.name || "טבלה";
    }
  }, [analyticsMap, goalsMap, tablesMap]);

  // C8+Issue1: Stable ID-based remove handler — uses ref for widget lookup
  const handleRemoveWidget = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    setDeleteModal({
      isOpen: true,
      widgetId,
      widgetTitle: widget ? getWidgetTitle(widget) : "",
    });
  }, [getWidgetTitle]);

  const confirmRemoveWidget = async () => {
    const { widgetId } = deleteModal;
    if (!widgetId) return;
    setActionLoading("removeWidget");
    try {
      // Remove from database
      const res = await removeDashboardWidget(widgetId);
      if (res.success) {
        setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
        // Clean up data
        setTableData((prev) => {
          const newData = { ...prev };
          delete newData[widgetId];
          return newData;
        });
        setTableLoading((prev) => {
          const newLoading = { ...prev };
          delete newLoading[widgetId];
          return newLoading;
        });
        delete lastFetchTime.current[widgetId];
        setLiveAnnouncement('');
        requestAnimationFrame(() => setLiveAnnouncement("ווידג׳ט הוסר מהדאשבורד"));
      }
      setDeleteModal({ isOpen: false, widgetId: "", widgetTitle: "" });
    } finally {
      setActionLoading(null);
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

  // Issue2: Pure state updater — side effect moved outside
  const handleWidgetSettingsChange = useCallback((widgetId: string, newSettings: any) => {
    setWidgets((prev) =>
      prev.map((w) => w.id === widgetId ? { ...w, settings: newSettings } : w)
    );
    // Read widget from ref (not from state updater) to schedule side effect
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (widget && widget.type === "TABLE" && widget.tableId && !newSettings?.collapsed) {
      fetchTableData(widgetId, widget.tableId, widget.referenceId, newSettings);
    }
  }, [fetchTableData]);

  // Mini Dashboard Logic
  const handleOpenMiniDashboardModal = () => {
    setEditingMiniDashboardId(null);
    setMiniDashboardTitle("מיני דאשבורד");
    setMiniDashboardViews([]);
    setIsMiniDashboardModalOpen(true);
  };

  const handleEditMiniDashboardById = useCallback((widgetId: string) => {
    const widget = widgetsRef.current.find((w) => w.id === widgetId);
    if (!widget) return;
    setEditingMiniDashboardId(widget.id);
    setMiniDashboardTitle(widget.settings?.title || "מיני דאשבורד");
    setMiniDashboardViews(widget.settings?.views || []);
    setIsMiniDashboardModalOpen(true);
  }, []);

  const handleAddMiniDashboard = async () => {
    // Basic validation
    if (!miniDashboardTitle) return;
    setActionLoading("miniDashboard");
    try {
      const settings = {
        title: miniDashboardTitle,
        views: miniDashboardViews,
        collapsed: false,
      };

      if (editingMiniDashboardId) {
        const res = await updateDashboardWidget(editingMiniDashboardId, {
          settings,
        });

        if (res.success) {
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === editingMiniDashboardId ? { ...w, settings } : w,
            ),
          );
        }
      } else {
        // @ts-ignore
        const res = await addDashboardWidget({
          widgetType: "TABLE_VIEWS_DASHBOARD",
          referenceId: "custom",
          settings,
        });

        if (res.success && res.data) {
          const newWidget: DashboardWidget = {
            id: res.data.id,
            type: res.data.widgetType as WidgetType,
            referenceId: res.data.referenceId || "custom",
            tableId: res.data.tableId ?? undefined,
            settings: res.data.settings,
          };
          setWidgets((prev) => [...prev, newWidget]);
        }
      }

      setIsMiniDashboardModalOpen(false);
      setEditingMiniDashboardId(null);
      setMiniDashboardViews([]);
      setMiniDashboardTitle("");
    } finally {
      setActionLoading(null);
    }
  };

  if (!canViewDashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center" role="alert">
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
      <div aria-live="polite" className="sr-only" role="status">{liveAnnouncement}</div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <LayoutDashboard className="text-blue-600" aria-hidden="true" />
          הדאשבורד שלי
        </h2>
        {canViewDashboard && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-2 w-full md:w-auto">
            <button
              onClick={handleOpenMiniDashboardModal}
              disabled={!canAddWidget}
              className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-blue-50 to-purple-50 text-blue-700 border border-blue-100 rounded-lg transition shadow-sm font-medium text-sm ${
                !canAddWidget
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-md"
              }`}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              הוסף מיני דאשבורד (תצוגות טבלה)
            </button>
            <button
              onClick={handleOpenGoalsTableModal}
              disabled={!canAddWidget}
              className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-100 rounded-lg transition shadow-sm font-medium text-sm ${
                !canAddWidget
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-md"
              }`}
            >
              <Target size={16} aria-hidden="true" />
              הוסף טבלת יעדים
            </button>
            <button
              onClick={handleOpenAnalyticsTableModal}
              disabled={!canAddWidget}
              className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-green-50 to-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg transition shadow-sm font-medium text-sm ${
                !canAddWidget
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-md"
              }`}
            >
              <BarChart3 size={16} aria-hidden="true" />
              הוסף טבלת אנליטיקות
            </button>
            {hasUserFlag(user, "canViewCalendar") && (
              <button
                onClick={handleAddMiniCalendar}
                disabled={!canAddWidget}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-cyan-50 to-blue-50 text-cyan-700 border border-cyan-100 rounded-lg transition shadow-sm font-medium text-sm ${
                  !canAddWidget
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:shadow-md"
                }`}
              >
                <Calendar size={16} aria-hidden="true" />
                מיני יומן
              </button>
            )}
            {hasUserFlag(user, "canViewTasks") && (
              <button
                onClick={handleAddMiniTasks}
                disabled={!canAddWidget}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-orange-50 to-amber-50 text-orange-700 border border-orange-100 rounded-lg transition shadow-sm font-medium text-sm ${
                  !canAddWidget
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:shadow-md"
                }`}
              >
                <CheckSquare size={16} aria-hidden="true" />
                מיני משימות
              </button>
            )}
            {hasUserFlag(user, "canViewQuotes") && (
              <button
                onClick={handleAddMiniQuotes}
                disabled={!canAddWidget}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-indigo-50 to-violet-50 text-indigo-700 border border-indigo-100 rounded-lg transition shadow-sm font-medium text-sm ${
                  !canAddWidget
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:shadow-md"
                }`}
              >
                <FileText size={16} aria-hidden="true" />
                מיני הצעות מחיר
              </button>
            )}
            {hasUserFlag(user, "canViewMeetings") && (
              <button
                onClick={handleAddMiniMeetings}
                disabled={!canAddWidget}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-linear-to-r from-violet-50 to-purple-50 text-violet-700 border border-violet-100 rounded-lg transition shadow-sm font-medium text-sm ${
                  !canAddWidget
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:shadow-md"
                }`}
              >
                <Calendar size={16} aria-hidden="true" />
                מיני פגישות
              </button>
            )}
            <button
              onClick={handleOpenAddModal}
              disabled={!canAddWidget}
              className={`flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition shadow-sm font-medium text-sm ${
                !canAddWidget
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-blue-700"
              }`}
            >
              <Plus size={16} aria-hidden="true" />
              הוסף וידג׳ט
            </button>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              const w = widgetsRef.current.find(w => w.id === active.id);
              return w ? `התחלת גרירה: ${getWidgetTitle(w)}` : '';
            },
            onDragOver({ active, over }) {
              const w = widgetsRef.current.find(w => w.id === active.id);
              return w && over ? `${getWidgetTitle(w)} מעל מיקום חדש` : '';
            },
            onDragEnd({ active, over }) {
              const w = widgetsRef.current.find(w => w.id === active.id);
              return w ? (over ? `${getWidgetTitle(w)} הועבר למיקום חדש` : `${getWidgetTitle(w)} הוחזר למקומו`) : '';
            },
            onDragCancel({ active }) {
              const w = widgetsRef.current.find(w => w.id === active.id);
              return w ? `בוטלה גרירה: ${getWidgetTitle(w)}` : '';
            },
          },
        }}
      >
        <SortableContext
          items={widgets.map((w) => w.id)}
          strategy={rectSortingStrategy}
        >
          <div
            id="dashboard-widgets"
            className={
              widgets.length > 0
                ? "columns-1 sm:columns-2 gap-6 space-y-6"
                : "w-full flex justify-center"
            }
          >
            {widgets.map((widget) => {
              const content = getWidgetContent(widget);

              if (widget.type === "ANALYTICS") {
                if (!content) return null;
                const view = content as any;
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <AnalyticsWidget
                      id={widget.id}
                      view={view}
                      onRemove={handleRemoveWidget}
                      onOpenDetails={setSelectedView}
                      onEdit={handleEditWidgetById}
                      settings={(widget as any).settings}
                      onSettingsChange={handleWidgetSettingsChange}
                    />
                  </div>
                );
              } else if (widget.type === "GOAL") {
                if (!content) return null;
                const goal = content as GoalWithProgress;
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <GoalWidget
                      id={widget.id}
                      goal={goal}
                      metrics={GOAL_METRICS}
                      tables={availableTables}
                      onRemove={handleRemoveWidget}
                    />
                  </div>
                );
              } else if (widget.type === "TABLE_VIEWS_DASHBOARD") {
                const settings = (widget as any).settings || {};
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <TableViewsDashboardWidget
                      id={widget.id}
                      title={settings.title}
                      views={settings.views || []}
                      availableTables={availableTables}
                      onRemove={handleRemoveWidget}
                      onEdit={handleEditMiniDashboardById}
                      settings={settings}
                      onSettingsChange={handleWidgetSettingsChange}
                    />
                  </div>
                );
              } else if (widget.type === "GOALS_TABLE") {
                const settings = (widget as any).settings || {};
                // C7: Use Set for O(1) membership check instead of Array.includes O(K)
                const goalIdSet = new Set<string>(settings.goalIds || []);
                const displayedGoals = availableGoals.filter((g) =>
                  goalIdSet.has(String(g.id)),
                );
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <GoalsTableWidget
                      id={widget.id}
                      title={settings.title}
                      goals={displayedGoals}
                      tables={availableTables}
                      onRemove={handleRemoveWidget}
                      onEdit={handleEditGoalsTableById}
                      settings={settings}
                    />
                  </div>
                );
              } else if (widget.type === "ANALYTICS_TABLE") {
                const settings = (widget as any).settings || {};
                // C7: Use Set for O(1) membership check instead of Array.includes O(K)
                const analyticsIdSet = new Set<string>(settings.analyticsIds || []);
                const displayedAnalytics = initialAnalytics.filter(
                  (a) =>
                    analyticsIdSet.has(String(a.id)) &&
                    a.type !== "GRAPH",
                );
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <AnalyticsTableWidget
                      id={widget.id}
                      title={settings.title}
                      analytics={displayedAnalytics}
                      onRemove={handleRemoveWidget}
                      onEdit={handleEditAnalyticsTableById}
                      settings={settings}
                    />
                  </div>
                );
              } else if (widget.type === "MINI_CALENDAR") {
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <MiniCalendarWidget
                      id={widget.id}
                      onRemove={handleRemoveWidget}
                      settings={(widget as any).settings}
                      onOpenSettings={handleOpenMiniWidgetSettingsById}
                    />
                  </div>
                );
              } else if (widget.type === "MINI_TASKS") {
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <MiniTasksWidget
                      id={widget.id}
                      onRemove={handleRemoveWidget}
                      settings={(widget as any).settings}
                      onOpenSettings={handleOpenMiniWidgetSettingsById}
                    />
                  </div>
                );
              } else if (widget.type === "MINI_QUOTES") {
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <MiniQuotesWidget
                      id={widget.id}
                      onRemove={handleRemoveWidget}
                      settings={(widget as any).settings}
                      onOpenSettings={handleOpenMiniWidgetSettingsById}
                    />
                  </div>
                );
              } else if (widget.type === "MINI_MEETINGS") {
                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <MiniMeetingsWidget
                      id={widget.id}
                      onRemove={handleRemoveWidget}
                      settings={(widget as any).settings}
                      onOpenSettings={handleOpenMiniWidgetSettingsById}
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
                      data-testid="dashboard-widget"
                    >
                      <CustomTableWidget
                        id={widget.id}
                        title={view.name}
                        tableName={table.name}
                        tableId={table.id}
                        data={fetchedData}
                        isLoading={isLoading}
                        onRemove={handleRemoveWidget}
                        onEdit={handleEditWidgetById}
                        settings={(widget as any).settings}
                        onSettingsChange={handleWidgetSettingsChange}
                      />
                    </div>
                  );
                }

                return (
                  <div key={widget.id} className="break-inside-avoid" data-testid="dashboard-widget">
                    <TableWidget
                      id={widget.id}
                      title={view.name}
                      tableName={table.name}
                      data={fetchedData}
                      isLoading={isLoading}
                      onRemove={handleRemoveWidget}
                      onEdit={handleEditWidgetById}
                      settings={(widget as any).settings}
                      onSettingsChange={handleWidgetSettingsChange}
                    />
                  </div>
                );
              }
            })}

            {!isWidgetsLoaded && widgets.length === 0 && (
              <div className="w-full flex items-center justify-center min-h-[500px]" role="status">
                <Spinner size="xl" />
                <span className="sr-only">טוען את הדאשבורד...</span>
              </div>
            )}

            {isWidgetsLoaded && widgets.length === 0 && (
              <div className="w-full max-w-4xl flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm mx-auto" role="status">
                {/* Background decoration */}
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-20" aria-hidden="true"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" aria-hidden="true"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-50/50 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none" aria-hidden="true"></div>

                <div className="relative z-10 flex flex-col items-center max-w-lg text-center p-8">
                  <div className="mb-8 relative group">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl flex items-center justify-center transform rotate-3 group-hover:rotate-6 transition-transform duration-300 shadow-sm" aria-hidden="true">
                      <LayoutDashboard className="w-10 h-10 text-[#4f95ff]" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-[#a24ec1] rotate-12 group-hover:rotate-12 transition-transform duration-300 border border-gray-50" aria-hidden="true">
                      <Plus className="w-5 h-5" />
                    </div>
                  </div>

                  <h2 className="text-3xl font-bold text-gray-900 mb-4">
                    {!canAddWidget ? "אין גישה לעריכה" : "הדאשבורד שלך ריק"}
                  </h2>

                  <p className="text-gray-500 text-lg mb-10 leading-relaxed">
                    {!canAddWidget
                      ? 'על מנת להוסיף ווידגט ללוח הבקרה תצטרכו ליצור תצוגה בתוך טבלה או אנליטיקה בעמוד "אנליטיקות"'
                      : "זה הזמן להפוך את הנתונים שלך לויזואליים. הוסף טבלאות, גרפים ויעדים כדי לקבל תמונת מצב מלאה על העסק."}
                  </p>

                  {canAddWidget && (
                    <button
                      onClick={handleOpenAddModal}
                      className="group relative inline-flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-[#4f95ff] to-[#a24ec1] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                      <span className="relative flex items-center gap-2 text-lg">
                        <Plus className="w-5 h-5" />
                        הוסף וידג׳ט ראשון
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {/* Optional: Render drag overlay for smoother visuals */}
        </DragOverlay>

        {/* Add Widget Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={(open) => {
          if (!open) { setIsAddModalOpen(false); setEditingWidgetId(null); }
        }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingWidgetId ? "עריכת וידג׳ט" : "הוספת וידג׳ט לדאשבורד"}</DialogTitle>
              <DialogDescription className="sr-only">בחר סוג וידג׳ט להוספה לדאשבורד</DialogDescription>
            </DialogHeader>

              <Tabs
                value={selectedType}
                onValueChange={(val) => {
                  if (editingWidgetId) return;
                  setSelectedType(val as WidgetType);
                  setSelectedItem("");
                  if (val === "TABLE") setIsCustomMode(true);
                }}
                className="space-y-4"
              >
                {/* Type Selection */}
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-2">
                    סוג מקור
                  </span>
                  <TabsList className="flex w-full gap-2 bg-gray-100 p-1 rounded-lg h-auto">
                    <TabsTrigger
                      value="ANALYTICS"
                      disabled={!!editingWidgetId}
                      className="flex-1 py-2 text-sm font-medium rounded-md transition data-[state=active]:bg-white data-[state=active]:shadow data-[state=active]:text-blue-600 data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700"
                    >
                      אנליטיקות
                    </TabsTrigger>
                    <TabsTrigger
                      value="GOAL"
                      disabled={!!editingWidgetId}
                      className="flex-1 py-2 text-sm font-medium rounded-md transition data-[state=active]:bg-white data-[state=active]:shadow data-[state=active]:text-blue-600 data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700"
                    >
                      יעדים
                    </TabsTrigger>
                    <TabsTrigger
                      value="TABLE"
                      disabled={!!editingWidgetId}
                      className="flex-1 py-2 text-sm font-medium rounded-md transition data-[state=active]:bg-white data-[state=active]:shadow data-[state=active]:text-blue-600 data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700"
                    >
                      תצוגות טבלה
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Content Selection */}
                <TabsContent value="ANALYTICS" className="mt-0">
                  <RadioGroup
                    value={selectedItem}
                    onValueChange={setSelectedItem}
                    className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 gap-0"
                  >
                    {initialAnalytics.map((a) => (
                      <label
                        key={a.id}
                        className={`w-full text-right p-3 hover:bg-blue-50 transition flex items-center justify-between cursor-pointer ${
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
                        <RadioGroupItem value={String(a.id)} />
                      </label>
                    ))}
                    {initialAnalytics.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-500">
                        לא נמצאו אנליטיקות זמינות.
                      </div>
                    )}
                  </RadioGroup>
                </TabsContent>

                <TabsContent value="GOAL" className="mt-0">
                  <RadioGroup
                    value={selectedItem}
                    onValueChange={setSelectedItem}
                    className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 gap-0"
                  >
                    {availableGoals.map((g) => (
                      <label
                        key={g.id}
                        className={`w-full text-right p-3 hover:bg-blue-50 transition flex items-center justify-between cursor-pointer ${
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
                        <RadioGroupItem value={String(g.id)} />
                      </label>
                    ))}
                    {availableGoals.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-500">
                        לא נמצאו יעדים זמינים.
                      </div>
                    )}
                  </RadioGroup>
                </TabsContent>

                <TabsContent value="TABLE" className="mt-0">
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="table-select" className="block text-xs font-semibold text-gray-500 mb-1">
                        בחר טבלה
                      </label>
                      <select
                        id="table-select"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm bg-white disabled:opacity-50 disabled:bg-gray-100"
                        value={selectedTable}
                        onChange={(e) => {
                          setSelectedTable(e.target.value);
                          setSelectedItem("custom");
                          setIsCustomMode(true);
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
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            בחר עמודות (מקסימום 7)
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                            {(
                              (tablesMap.get(Number(selectedTable))
                                ?.schemaJson as any) || []
                            ).map((field: any) => (
                              <label
                                key={field.name}
                                className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  checked={selectedColumns.includes(field.name)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      if (selectedColumns.length >= 7) return;
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
                                  checked={selectedColumns.includes(field.name)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      if (selectedColumns.length >= 7) return;
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
                          התצוגה תהיה ממוינת מהחדש לישן ותציג 10 רשומות אחרונות.
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

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
                    (isCustomMode && selectedColumns.length === 0) ||
                    actionLoading === "addWidget"
                  }
                  onClick={handleAddWidget}
                  className="flex-1 py-2.5 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionLoading === "addWidget" && <Spinner size="sm" />}
                  {editingWidgetId ? "שמור שינויים" : "הוסף לדאשבורד"}
                </button>
              </div>
          </DialogContent>
        </Dialog>
      </DndContext>

      {/* Mini Dashboard Modal */}
      <Dialog open={isMiniDashboardModalOpen} onOpenChange={(open) => {
        if (!open) { setIsMiniDashboardModalOpen(false); setEditingMiniDashboardId(null); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="text-blue-600" aria-hidden="true" />
              {editingMiniDashboardId
                ? "עריכת מיני דאשבורד"
                : "הוספת מיני דאשבורד"}
            </DialogTitle>
            <DialogDescription className="sr-only">הגדר מיני דאשבורד עם תצוגות טבלה</DialogDescription>
          </DialogHeader>

            <div className="space-y-6 flex-1 overflow-y-auto p-1">
              {/* Title Input */}
              <div>
                <label htmlFor="mini-dashboard-title" className="block text-sm font-medium text-gray-700 mb-2">
                  כותרת
                </label>
                <input
                  id="mini-dashboard-title"
                  type="text"
                  value={miniDashboardTitle}
                  onChange={(e) => setMiniDashboardTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="דוגמה: סיכום לידים ומכירות"
                />
              </div>

              {/* Views Selection */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    תצוגות שנבחרו ({miniDashboardViews.length})
                  </label>
                </div>

                {/* Selected Views List */}
                {miniDashboardViews.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 min-h-[60px]">
                    {miniDashboardViews.map((view, idx) => (
                      <div
                        key={`${view.tableId}-${view.viewId}-${idx}`}
                        className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm text-sm group"
                      >
                        <span className="font-medium text-gray-800">
                          {view.viewName}
                        </span>
                        <span className="text-xs text-gray-400 border-r border-gray-200 pr-2 mr-1">
                          {view.tableName}
                        </span>
                        <button
                          onClick={() => {
                            const newViews = [...miniDashboardViews];
                            newViews.splice(idx, 1);
                            setMiniDashboardViews(newViews);
                          }}
                          className="text-gray-400 hover:text-red-500 transition ml-1"
                          aria-label={`הסר תצוגה: ${view.viewName}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Views Selection Area */}
                <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col max-h-[400px]">
                  <div className="bg-gray-50 p-3 text-xs font-semibold text-gray-500 border-b border-gray-200">
                    בחר תצוגות להוספה
                  </div>
                  <div className="overflow-y-auto p-2">
                    {availableTables.map((table) => {
                      // Filter views that are simple enough for mini dashboard
                      // Or just show all? showing all stats/aggregation views makes most sense.
                      return (
                        <div key={table.id} className="mb-4 last:mb-0">
                          <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wide px-2 mb-2">
                            {table.name}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {table.views
                              ?.filter(
                                (view: any) => view.config?.type !== "legend",
                              )
                              .map((view: any) => {
                                const isSelected = miniDashboardViews.some(
                                  (v) =>
                                    v.tableId === table.id &&
                                    v.viewId === view.id,
                                );
                                // We can allow duplicate views in different mini dashboards, but here maybe prevent duplicates in SAME dashboard

                                return (
                                  <button
                                    key={view.id}
                                    onClick={() => {
                                      // Prevent duplicates
                                      if (
                                        miniDashboardViews.some(
                                          (v) =>
                                            v.tableId === table.id &&
                                            v.viewId === view.id,
                                        )
                                      ) {
                                        return;
                                      }

                                      // Add view
                                      setMiniDashboardViews([
                                        ...miniDashboardViews,
                                        {
                                          tableId: table.id,
                                          viewId: view.id,
                                          tableName: table.name,
                                          viewName: view.name,
                                          colorIndex: miniDashboardViews.length,
                                        },
                                      ]);
                                    }}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border text-right transition ${
                                      isSelected
                                        ? "bg-blue-50 border-blue-200 cursor-default" // Allowing duplicates? maybe best to not disable but show added indicator
                                        : "bg-white border-gray-100 hover:border-blue-300 hover:shadow-sm"
                                    }`}
                                  >
                                    <div className="truncate">
                                      <div className="font-medium text-sm text-gray-800 truncate">
                                        {view.name}
                                      </div>
                                      <div className="text-[10px] text-gray-500">
                                        {view.config?.type === "stats"
                                          ? "סטטיסטיקה"
                                          : view.config?.type === "aggregation"
                                            ? "אגרגציה"
                                            : "רגיל"}
                                      </div>
                                    </div>
                                    <div className="shrink-0 w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition">
                                      <Plus size={14} />
                                    </div>
                                  </button>
                                );
                              })}
                            {(!table.views || table.views.length === 0) && (
                              <div className="text-xs text-gray-400 px-2 italic col-span-2">
                                אין תצוגות זמינות
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setIsMiniDashboardModalOpen(false);
                  setEditingMiniDashboardId(null);
                }}
                className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition"
              >
                ביטול
              </button>
              <button
                disabled={
                  !miniDashboardTitle || miniDashboardViews.length === 0 ||
                  actionLoading === "miniDashboard"
                }
                onClick={handleAddMiniDashboard}
                className="flex-1 py-2.5 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-200 flex items-center justify-center gap-2"
              >
                {actionLoading === "miniDashboard" && <Spinner size="sm" />}
                {editingMiniDashboardId ? "שמור שינויים" : "צור מיני דאשבורד"}
              </button>
            </div>
        </DialogContent>
      </Dialog>

      {/* Goals Table Modal */}
      <Dialog open={isGoalsTableModalOpen} onOpenChange={(open) => {
        if (!open) { setIsGoalsTableModalOpen(false); setEditingGoalsTableId(null); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="text-purple-600" aria-hidden="true" />
              {editingGoalsTableId ? "עריכת טבלת יעדים" : "הוספת טבלת יעדים"}
            </DialogTitle>
            <DialogDescription className="sr-only">בחר יעדים להצגה בטבלת יעדים</DialogDescription>
          </DialogHeader>

            <div className="space-y-6 flex-1 overflow-y-auto p-1">
              <div>
                <label htmlFor="goals-table-title" className="block text-sm font-medium text-gray-700 mb-2">
                  כותרת
                </label>
                <input
                  id="goals-table-title"
                  type="text"
                  value={goalsTableTitle}
                  onChange={(e) => setGoalsTableTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  placeholder="דוגמה: יעדי מכירות רבעוניים"
                />
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    בחר יעדים להצגה (
                    {
                      goalsTableSelectedIds.filter((id) =>
                        availableGoals.some((g) => String(g.id) === id),
                      ).length
                    }
                    )
                  </label>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col max-h-[400px]" role="group" aria-label="בחר יעדים להצגה">
                  <div className="overflow-y-auto p-2">
                    {availableGoals.map((goal) => (
                      <label
                        key={goal.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition border border-transparent hover:border-gray-100"
                      >
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          checked={goalsTableSelectedIds.includes(
                            String(goal.id),
                          )}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setGoalsTableSelectedIds([
                                ...goalsTableSelectedIds,
                                String(goal.id),
                              ]);
                            } else {
                              setGoalsTableSelectedIds(
                                goalsTableSelectedIds.filter(
                                  (id) => id !== String(goal.id),
                                ),
                              );
                            }
                          }}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {goal.name}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span>{goal.metricType}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span>
                              יעד:{" "}
                              {new Intl.NumberFormat("he-IL", {
                                notation: "compact",
                              }).format(goal.targetValue)}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                    {availableGoals.length === 0 && (
                      <div className="p-8 text-center text-gray-500">
                        לא נמצאו יעדים זמינים.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setIsGoalsTableModalOpen(false);
                  setEditingGoalsTableId(null);
                }}
                className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition"
              >
                ביטול
              </button>
              <button
                disabled={
                  !goalsTableTitle || goalsTableSelectedIds.length === 0 ||
                  actionLoading === "goalsTable"
                }
                onClick={handleAddGoalsTable}
                className="flex-1 py-2.5 text-white bg-purple-600 rounded-xl hover:bg-purple-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-purple-200 flex items-center justify-center gap-2"
              >
                {actionLoading === "goalsTable" && <Spinner size="sm" />}
                {editingGoalsTableId ? "שמור שינויים" : "צור טבלה"}
              </button>
            </div>
        </DialogContent>
      </Dialog>

      {/* Analytics Table Modal */}
      <Dialog open={isAnalyticsTableModalOpen} onOpenChange={(open) => {
        if (!open) { setIsAnalyticsTableModalOpen(false); setEditingAnalyticsTableId(null); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="text-emerald-600" aria-hidden="true" />
              {editingAnalyticsTableId
                ? "עריכת טבלת אנליטיקות"
                : "הוספת טבלת אנליטיקות"}
            </DialogTitle>
            <DialogDescription className="sr-only">בחר אנליטיקות להצגה בטבלה</DialogDescription>
          </DialogHeader>

            <div className="space-y-6 flex-1 overflow-y-auto p-1">
              <div>
                <label htmlFor="analytics-table-title" className="block text-sm font-medium text-gray-700 mb-2">
                  כותרת
                </label>
                <input
                  id="analytics-table-title"
                  type="text"
                  value={analyticsTableTitle}
                  onChange={(e) => setAnalyticsTableTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                  placeholder="דוגמה: אנליטיקות מכירות"
                />
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    בחר אנליטיקות להצגה ({analyticsTableSelectedIds.length})
                  </label>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col max-h-[400px]" role="group" aria-label="בחר אנליטיקות להצגה">
                  <div className="overflow-y-auto p-2">
                    {(() => {
                      const availableAnalytics = initialAnalytics.filter(
                        (a) => a.type !== "GRAPH",
                      );

                      if (availableAnalytics.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                              <BarChart3 className="w-8 h-8 text-gray-300" />
                            </div>
                            <h3 className="text-gray-900 font-medium mb-1">
                              לא נמצאו אנליטיקות זמינות
                            </h3>
                            <p className="text-sm text-gray-500 max-w-[250px] mx-auto leading-relaxed">
                              ניתן להוסיף אנליטיקות חדשות דרך עמוד האנליטיקות
                            </p>
                          </div>
                        );
                      }

                      return availableAnalytics.map((analytic) => (
                        <label
                          key={analytic.id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition border border-transparent hover:border-gray-100 group"
                        >
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 transition"
                            checked={analyticsTableSelectedIds.includes(
                              String(analytic.id),
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAnalyticsTableSelectedIds([
                                  ...analyticsTableSelectedIds,
                                  String(analytic.id),
                                ]);
                              } else {
                                setAnalyticsTableSelectedIds(
                                  analyticsTableSelectedIds.filter(
                                    (id) => id !== String(analytic.id),
                                  ),
                                );
                              }
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 group-hover:text-emerald-700 transition">
                              {analytic.ruleName}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                                {analytic.tableName === "System"
                                  ? "מערכת"
                                  : analytic.tableName}
                              </span>
                            </div>
                          </div>
                        </label>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setIsAnalyticsTableModalOpen(false);
                  setEditingAnalyticsTableId(null);
                }}
                className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition"
              >
                ביטול
              </button>
              <button
                disabled={
                  !analyticsTableTitle || analyticsTableSelectedIds.length === 0 ||
                  actionLoading === "analyticsTable"
                }
                onClick={handleAddAnalyticsTable}
                className="flex-1 py-2.5 text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
              >
                {actionLoading === "analyticsTable" && <Spinner size="sm" />}
                {editingAnalyticsTableId ? "שמור שינויים" : "צור טבלה"}
              </button>
            </div>
        </DialogContent>
      </Dialog>

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
        isLoading={actionLoading === "removeWidget"}
      />

      {/* Mini Widget Config Modal */}
      {miniConfigModal?.open && (
        <MiniWidgetConfigModal
          widgetType={miniConfigModal.widgetType}
          currentSettings={miniConfigModal.currentSettings}
          onConfirm={handleMiniConfigConfirm}
          onClose={() => setMiniConfigModal(null)}
          canViewAllTasks={hasUserFlag(user, "canViewAllTasks")}
        />
      )}
    </div>
  );
}
