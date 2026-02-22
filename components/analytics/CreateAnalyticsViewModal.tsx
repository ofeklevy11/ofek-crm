"use client";

import { Fragment, useState, useEffect } from "react";
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  BarChart,
  Percent,
  Clock,
  Calculator,
  LineChart,
  PieChart,
  AreaChart,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { getTables } from "@/app/actions/tables";
import {
  createAnalyticsView,
  updateAnalyticsView,
  previewAnalyticsView,
  getAnalyticsLimits,
} from "@/app/actions/analytics";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

// Plan labels for display
const PLAN_LABELS: Record<string, string> = {
  basic: "בייסיק",
  premium: "פרימיום",
  super: "סופר",
};

interface CreateAnalyticsViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
  mode?: "general" | "graph";
}

const GRAPH_TYPES = [
  {
    id: "bar",
    label: "גרף עמודות",
    description: "השוואה כמותית בין קטגוריות שונות",
    icon: BarChart,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "line",
    label: "גרף קו",
    description: "הצגת מגמות ושינויים לאורך זמן",
    icon: LineChart,
    color: "bg-green-50 text-green-600",
  },
  {
    id: "pie",
    label: "גרף עוגה",
    description: "הצגת חלוקה יחסית של השלם",
    icon: PieChart,
    color: "bg-orange-50 text-orange-600",
  },
  {
    id: "area",
    label: "גרף שטח",
    description: "המחשת נפח ומגמות מצטברות",
    icon: AreaChart,
    color: "bg-purple-50 text-purple-600",
  },
];

const VIEW_TYPES = [
  {
    id: "CONVERSION",
    label: "אחוז המרה",
    description:
      "חישוב יחס בין שתי קבוצות נתונים (למשל: לידים שנסגרו מתוך סך הלידים)",
    icon: Percent,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "COUNT",
    label: "ספירה / פילוח",
    description:
      "ספירת רשומות או משימות לפי חתכים שונים (למשל: כמות משימות פתוחות לכל נציג)",
    icon: BarChart,
    color: "bg-purple-50 text-purple-600",
  },
  {
    id: "GRAPH",
    label: "גרף ויזואלי",
    description: "הצגת נתונים ויזואלית (עמודות, קו, עוגה)",
    icon: BarChart, // Using BarChart as generic icon
    color: "bg-pink-50 text-pink-600",
  },
  // Placeholder for future types
  /*
  {
    id: "DURATION",
    label: "זמן ממוצע",
    description: "מדידת זמן בין שלבים (דורש הגדרת אוטומציה)",
    icon: Clock,
    color: "bg-orange-50 text-orange-600",
  }
  */
];

export default function CreateAnalyticsViewModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  mode = "general",
}: CreateAnalyticsViewModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<any[]>([]);

  // Form State
  const [selectedType, setSelectedType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<any>({});

  // Internal mode for inline graph creation from general mode
  const [internalMode, setInternalMode] = useState<"graph" | null>(null);
  const effectiveMode = internalMode || mode;
  const isGraphSubflow = mode === "general" && internalMode === "graph";

  // Preview State
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Plan limits state
  const [limitsData, setLimitsData] = useState<any>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [submitError, setSubmitError] = useState("");

  // Initialize from initialData when opening
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Edit Mode
        setTitle(initialData.ruleName || initialData.title || "");
        setSelectedType(initialData.type || "COUNT");
        setConfig(initialData.config || {});
        // If editing a GRAPH-type view from general mode, enter graph sub-flow
        if (initialData.type === "GRAPH" && mode === "general") {
          setInternalMode("graph");
        } else {
          setInternalMode(null);
        }
        setStep(2); // Jump to configuration
      } else {
        // Create Mode - Reset
        setStep(1);
        setTitle("");
        setSelectedType("");
        setConfig({});
        setPreviewData(null);
        setShowPreview(false);
        setInternalMode(null);
      }
    }
  }, [isOpen, initialData]);

  // Fetch tables on mount
  useEffect(() => {
    getTables().then((res) => {
      if (res.success && res.data) {
        setTables(res.data);
      }
    });
  }, []);

  // Fetch plan limits on mount
  useEffect(() => {
    if (isOpen) {
      setLoadingLimits(true);
      setSubmitError("");
      getAnalyticsLimits()
        .then((res) => {
          if (res.success) {
            setLimitsData(res);
          }
        })
        .finally(() => setLoadingLimits(false));
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError("");
    try {
      if (initialData && initialData.viewId) {
        // Update
        const res = await updateAnalyticsView(initialData.viewId, {
          title,
          type: selectedType,
          config: config,
        });
        if (res.success) {
          toast.success("התצוגה עודכנה בהצלחה");
          onSuccess();
          onClose();
        } else {
          setSubmitError(res.error || "שגיאה בשמירה");
        }
      } else {
        // Create
        const res = await createAnalyticsView({
          title,
          type: selectedType,
          config: config,
        });
        if (res.success) {
          toast.success("התצוגה נוצרה בהצלחה");
          onSuccess();
          onClose();
        } else {
          setSubmitError(res.error || "שגיאה ביצירה");
        }
      }
    } catch (error) {
      console.error("Failed to save view", error);
      toast.error(getUserFriendlyError(error));
      setSubmitError("שגיאה בלתי צפויה");
    } finally {
      setLoading(false);
    }
  };

  // Preview function
  const handlePreview = async () => {
    if (!selectedType || selectedType === "GRAPH") return;

    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const res = await previewAnalyticsView({
        type: selectedType,
        config: config,
      });
      if (res.success) {
        setPreviewData(res.data);
      } else {
        setPreviewData({ error: res.error || "שגיאה בטעינת התצוגה המקדימה" });
      }
    } catch (error) {
      console.error("Preview error:", error);
      setPreviewData({ error: "שגיאה בטעינת התצוגה המקדימה" });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Render preview component
  const renderPreview = () => {
    if (!showPreview) return null;

    return (
      <div className="mt-6 p-4 bg-linear-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-blue-600" />
            <h4 className="font-semibold text-gray-900">תצוגה מקדימה</h4>
          </div>
          <button
            onClick={() => setShowPreview(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {previewLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : previewData?.error ? (
          <div className="text-center py-6">
            <p className="text-red-600 text-sm">{previewData.error}</p>
          </div>
        ) : previewData?.stats ? (
          <div className="space-y-4">
            {/* Main Stat */}
            <div className="text-center bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {previewData.stats.mainMetric}
              </div>
              <div className="text-sm text-gray-500">
                {previewData.stats.label}
              </div>
              {previewData.stats.subMetric && (
                <div className="text-xs text-gray-400 mt-1">
                  {previewData.stats.subMetric}
                </div>
              )}
            </div>

            {/* Source Info */}
            <div className="flex items-center justify-between text-xs text-gray-500 bg-white/50 rounded-lg px-3 py-2">
              <span>מקור: {previewData.tableName}</span>
              <span>סה״כ: {previewData.totalRecords} רשומות</span>
            </div>

            {/* Preview Items */}
            {previewData.items && previewData.items.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 mb-2">דוגמאות ראשונות:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {previewData.items
                    .slice(0, 5)
                    .map((item: any, idx: number) => (
                      <div
                        key={item.id || idx}
                        className="bg-white rounded-md px-3 py-2 text-sm flex justify-between items-center border border-gray-100"
                      >
                        <span className="text-gray-700 truncate flex-1">
                          {item.title || item.name || `פריט ${idx + 1}`}
                        </span>
                        <span className="text-blue-600 font-medium mr-2">
                          {item.value || item.status || ""}
                        </span>
                      </div>
                    ))}
                </div>
                {previewData.items.length > 5 && (
                  <p className="text-xs text-gray-400 text-center">
                    +{previewData.items.length - 5} פריטים נוספים
                  </p>
                )}
              </div>
            )}

            {/* Empty State */}
            {(!previewData.items || previewData.items.length === 0) && (
              <div className="text-center py-4 bg-yellow-50 border border-yellow-100 rounded-lg">
                <p className="text-yellow-700 text-sm font-medium">
                  לא נמצאו נתונים בהתאם להגדרות
                </p>
                <p className="text-yellow-600 text-xs mt-1">
                  נסה לשנות את הסינון או מקור הנתונים
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400 text-sm">
            לחץ על "תצוגה מקדימה" כדי לראות את התוצאות
          </div>
        )}
      </div>
    );
  };

  const renderStep1 = () => {
    const items = effectiveMode === "graph" ? GRAPH_TYPES : VIEW_TYPES;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected =
            effectiveMode === "graph"
              ? config.chartType === item.id
              : selectedType === item.id;

          // Check Limits
          let isLimitReached = false;
          let limitMessage = "";

          // Only enforce limits if we are creating new (not editing)
          if (
            !initialData?.viewId &&
            limitsData?.success &&
            limitsData?.remaining
          ) {
            if (effectiveMode === "graph") {
              // Creating a graph view
              if (limitsData.remaining.graph <= 0) {
                isLimitReached = true;
                limitMessage = `הגעת למגבלת הגרפים (${limitsData.limits.graph})`;
              }
            } else {
              // General mode
              if (item.id === "GRAPH") {
                if (limitsData.remaining.graph <= 0) {
                  isLimitReached = true;
                  limitMessage = `הגעת למגבלת הגרפים (${limitsData.limits.graph})`;
                }
              } else {
                // Regular analytics (Conversion, Count)
                if (limitsData.remaining.regular <= 0) {
                  isLimitReached = true;
                  limitMessage = `הגעת למגבלת האנליטיקות (${limitsData.limits.regular})`;
                }
              }
            }
          }

          // Super users bypass limits (backend handles this too via 'Infinity', but explicit check is safe)
          if (limitsData?.plan === "super") {
            isLimitReached = false;
          }

          return (
            <button
              key={item.id}
              disabled={isLimitReached}
              onClick={() => {
                if (isLimitReached) return;

                if (effectiveMode === "graph") {
                  setSelectedType("GRAPH");
                  setConfig({ ...config, chartType: item.id });
                } else {
                  setSelectedType(item.id);
                }
              }}
              className={`p-4 rounded-xl border-2 text-right transition-all flex flex-col gap-3 ${
                isLimitReached
                  ? "opacity-50 cursor-not-allowed border-gray-100 bg-gray-50"
                  : "hover:border-blue-500 hover:shadow-md"
              } ${
                isSelected
                  ? "border-blue-600 bg-blue-50/50"
                  : !isLimitReached
                    ? "border-gray-100 bg-white"
                    : ""
              }`}
            >
              <div
                className={`p-3 rounded-lg w-fit ${isLimitReached ? "bg-gray-200 text-gray-400" : item.color}`}
              >
                <Icon size={24} />
              </div>
              <div>
                <h3
                  className={`font-bold ${isLimitReached ? "text-gray-400" : "text-gray-900"}`}
                >
                  {item.label}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                {isLimitReached && (
                  <p className="text-xs text-red-500 font-bold mt-2 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {limitMessage}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const SYSTEM_TASK_FIELDS = [
    {
      systemName: "status",
      displayName: "סטטוס",
      type: "select",
      options: [
        { label: "משימות", value: "todo" },
        { label: "משימות בטיפול", value: "in_progress" },
        { label: "ממתינים לאישור לקוח", value: "waiting_client" },
        { label: "משימות בהשהייה", value: "on_hold" },
        { label: "בוצעו החודש", value: "completed_month" },
        { label: "משימות שבוצעו", value: "done" },
        { label: "ארכיון", value: "archive" },
      ],
    },
    {
      systemName: "priority",
      displayName: "עדיפות",
      type: "select",
      options: [
        { label: "נמוכה", value: "low" },
        { label: "בינונית", value: "medium" },
        { label: "גבוהה", value: "high" },
      ],
    },
    { systemName: "assignee", displayName: "נציג מטפל", type: "text" },
    { systemName: "tags", displayName: "תגיות", type: "text" },
  ];

  const SYSTEM_RETAINER_FIELDS = [
    {
      systemName: "status",
      displayName: "סטטוס",
      type: "select",
      options: ["active", "paused", "cancelled"],
    },
    {
      systemName: "frequency",
      displayName: "תדירות",
      type: "select",
      options: ["Monthly", "Yearly", "Quarterly"],
    },
    { systemName: "amount", displayName: "סכום", type: "number" },
    { systemName: "title", displayName: "כותרת", type: "text" },
    { systemName: "clientName", displayName: "שם לקוח", type: "text" },
  ];

  const SYSTEM_PAYMENT_FIELDS = [
    {
      systemName: "status",
      displayName: "סטטוס",
      type: "select",
      options: ["paid", "overdue", "pending", "cancelled"],
    },
    { systemName: "amount", displayName: "סכום", type: "number" },
    { systemName: "title", displayName: "כותרת", type: "text" },
    { systemName: "clientName", displayName: "שם לקוח", type: "text" },
  ];

  const SYSTEM_TRANSACTION_FIELDS = [
    {
      systemName: "status",
      displayName: "סטטוס",
      type: "select",
      options: ["completed", "failed", "pending"],
    },
    { systemName: "amount", displayName: "סכום", type: "number" },
    { systemName: "relatedType", displayName: "סוג", type: "text" },
    { systemName: "clientName", displayName: "שם לקוח", type: "text" },
  ];

  const SYSTEM_CALENDAR_FIELDS = [
    { systemName: "title", displayName: "כותרת", type: "text" },
    { systemName: "description", displayName: "תיאור", type: "text" },
  ];

  const renderStep2 = () => {
    // Determine available fields based on selection
    let currentFields: any[] = [];
    if (config.model === "Task") {
      currentFields = SYSTEM_TASK_FIELDS;
    } else if (config.model === "Retainer") {
      currentFields = SYSTEM_RETAINER_FIELDS;
    } else if (config.model === "OneTimePayment") {
      // Using OneTimePayment to match Prisma model
      currentFields = SYSTEM_PAYMENT_FIELDS;
    } else if (config.model === "Transaction") {
      currentFields = SYSTEM_TRANSACTION_FIELDS;
    } else if (config.model === "CalendarEvent") {
      currentFields = SYSTEM_CALENDAR_FIELDS;
    } else if (config.tableId) {
      const table = tables.find((t) => String(t.id) === String(config.tableId));
      if (table && table.schemaJson) {
        // Handle both array/object structures, and try to parse if string
        let schema = table.schemaJson;
        if (typeof schema === "string") {
          try {
            schema = JSON.parse(schema);
          } catch (e) {
            schema = [];
          }
        }

        // Normalize to array
        const rawFields = Array.isArray(schema) ? schema : schema.columns || [];

        // Map to standard format { systemName, displayName }
        // Dynamic tables use 'name' and 'label'
        currentFields = rawFields
          .map((f: any) => ({
            systemName: f.name || f.systemName || f.key || f.id,
            displayName:
              f.label || f.title || f.displayName || f.name || f.systemName,
            type: f.type,
            options: f.options,
          }))
          .filter((f: any) => f.systemName); // Ensure valid ID
      }
    }

    // Helper: Render Field Selector
    const FieldSelect = ({
      label,
      value,
      onChange,
      placeholder = "בחר שדה...",
    }: any) => (
      <div className="flex-1">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <select
          className="w-full border border-gray-300 rounded-md p-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {currentFields.map((f: any) => (
            <option key={f.systemName} value={f.systemName}>
              {f.displayName}
            </option>
          ))}
        </select>
      </div>
    );

    // Helper: Render Value Selector (Dynamic based on selected field)
    const ValueInput = ({
      label,
      fieldName,
      value,
      onChange,
      placeholder = "ערך...",
    }: any) => {
      // If no field is selected, disable the input
      if (!fieldName) {
        return (
          <div className="flex-1">
            {label && (
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>
            )}
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md p-2 text-left bg-gray-100 text-gray-500 cursor-not-allowed"
              dir="ltr"
              placeholder="בחר שדה קודם..."
              value=""
              disabled
              readOnly
            />
          </div>
        );
      }

      const field = currentFields.find((f) => f.systemName === fieldName);
      let options: any[] = [];

      if (field?.options) {
        if (Array.isArray(field.options)) {
          options = field.options;
        } else if (typeof field.options === "string") {
          options = field.options.split(",").map((o: string) => o.trim());
        }
      }

      const isSelect =
        field?.type === "select" ||
        field?.type === "multi-select" ||
        field?.type === "radio" ||
        options.length > 0;

      return (
        <div className="flex-1">
          {label && (
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label}
            </label>
          )}
          {isSelect ? (
            <select
              className="w-full border border-gray-300 rounded-md p-2"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">{placeholder}</option>
              {options.map((opt: any) => {
                const val = typeof opt === "object" ? opt.value : opt;
                const lbl = typeof opt === "object" ? opt.label : opt;
                return (
                  <option key={val} value={val}>
                    {lbl}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md p-2 text-left"
              dir="ltr"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
      );
    };

    // Shared Inputs
    const TableSelect = () => (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          בחר מקור נתונים
        </label>
        <select
          className="w-full border border-gray-300 rounded-md p-2"
          value={config.tableId || config.model || ""}
          onChange={(e) => {
            const val = e.target.value;
            let newConfig = {
              ...config,
              groupByField: "",
              totalFilter: {},
              successFilter: {},
              filter: {},
            };

            // value matches the model name directly now
            if (val === "Task") {
              newConfig = { ...newConfig, model: "Task", tableId: undefined };
            } else if (val === "Retainer") {
              newConfig = {
                ...newConfig,
                model: "Retainer",
                tableId: undefined,
              };
            } else if (val === "OneTimePayment") {
              newConfig = {
                ...newConfig,
                model: "OneTimePayment",
                tableId: undefined,
              };
            } else if (val === "Transaction") {
              newConfig = {
                ...newConfig,
                model: "Transaction",
                tableId: undefined,
              };
            } else if (val === "CalendarEvent") {
              newConfig = {
                ...newConfig,
                model: "CalendarEvent",
                tableId: undefined,
              };
            } else if (val) {
              newConfig = { ...newConfig, tableId: val, model: undefined };
            } else {
              newConfig = {
                ...newConfig,
                tableId: undefined,
                model: undefined,
              };
            }
            setConfig(newConfig);
          }}
        >
          <option value="">בחר נתונים...</option>
          <optgroup label="מערכת">
            <option value="Task">משימות מערכת</option>
            <option value="Retainer">פיננסים - ריטיינרים</option>
            <option value="OneTimePayment">פיננסים - תשלומים חד פעמיים</option>
            <option value="Transaction">פיננסים - תנועות</option>
            <option value="CalendarEvent">יומן - אירועים</option>
          </optgroup>
          <optgroup label="טבלאות מותאמות">
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    );

    const GroupByInput = () => (
      <div className="space-y-2">
        {FieldSelect({
          label: "קבץ לפי שדה (אופציונלי)",
          value: config.groupByField || "",
          onChange: (val: string) => {
            const newConfig = { ...config, groupByField: val };
            // Auto-fill filter fields if they are empty
            if (val && selectedType === "CONVERSION") {
              if (!Object.keys(newConfig.totalFilter || {}).length) {
                newConfig.totalFilter = { [val]: "" };
              }
              if (!Object.keys(newConfig.successFilter || {}).length) {
                newConfig.successFilter = { [val]: "" };
              }
            }
            setConfig(newConfig);
          },
          placeholder: "בחר שדה לקיבוץ...",
        })}
        <p className="text-xs text-gray-500">
          השאר ריק כדי לקבל חישוב כללי לכל המאגר.
        </p>
      </div>
    );

    const DateFilter = () => (
      <div className="space-y-2 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <label className="block text-sm font-medium text-gray-700">
          טווח זמנים
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "הכל" },
            { id: "this_week", label: "השבוע (א'-ש')" },
            { id: "last_30_days", label: "30 ימים אחרונים" },
            { id: "last_year", label: "שנה אחרונה" },
            { id: "custom", label: "מותאם אישית" },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setConfig({ ...config, dateRangeType: option.id })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                (config.dateRangeType || "all") === option.id
                  ? "bg-blue-100 text-blue-700 border-blue-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {config.model === "CalendarEvent" && (
          <p className="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded border border-orange-100">
            שים לב: עבור יומן, החישוב מתבצע לפי זמן האירוע (Start Time) ולא לפי
            זמן היצירה.
          </p>
        )}

        {config.dateRangeType === "custom" && (
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
              <input
                type="date"
                value={config.customStartDate || ""}
                onChange={(e) =>
                  setConfig({ ...config, customStartDate: e.target.value })
                }
                className="w-full border border-gray-300 rounded p-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                עד תאריך
              </label>
              <input
                type="date"
                value={config.customEndDate || ""}
                onChange={(e) =>
                  setConfig({ ...config, customEndDate: e.target.value })
                }
                className="w-full border border-gray-300 rounded p-1.5 text-sm"
              />
            </div>
          </div>
        )}
      </div>
    );

    if (selectedType === "CONVERSION") {
      const totalKey = Object.keys(config.totalFilter || {})[0] || "";
      const totalVal =
        (Object.values(config.totalFilter || {})[0] as string) || "";

      const successKey = Object.keys(config.successFilter || {})[0] || "";
      const successVal =
        (Object.values(config.successFilter || {})[0] as string) || "";

      return (
        <div className="space-y-6">
          {TableSelect()}
          {DateFilter()}
          {GroupByInput()}

          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
            <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">
              הגדרת חישוב המרה
            </h4>

            {/* Total Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סך הכל (מכנה) - תנאי סינון
              </label>
              <div className="flex gap-2">
                {FieldSelect({
                  value: totalKey,
                  onChange: (key: string) => {
                    const val = key ? totalVal : "";
                    setConfig({
                      ...config,
                      totalFilter: key ? { [key]: val } : {},
                    });
                  },
                  placeholder: "שדה...",
                })}
                {ValueInput({
                  fieldName: totalKey,
                  value: totalVal,
                  onChange: (val: string) => {
                    if (totalKey)
                      setConfig({
                        ...config,
                        totalFilter: { [totalKey]: val },
                      });
                  },
                  placeholder: "ערך...",
                })}
              </div>
              <p className="text-xs text-gray-500">
                אם ריק, יחשב את כל הרשומות בטבלה.
              </p>
            </div>

            {/* Success Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                הצלחה (מונה) - תנאי סינון
              </label>
              <div className="flex gap-2">
                {FieldSelect({
                  value: successKey,
                  onChange: (key: string) => {
                    const val = key ? successVal : "";
                    setConfig({
                      ...config,
                      successFilter: key ? { [key]: val } : {},
                    });
                  },
                  placeholder: "שדה...",
                })}
                {ValueInput({
                  fieldName: successKey,
                  value: successVal,
                  onChange: (val: string) => {
                    if (successKey)
                      setConfig({
                        ...config,
                        successFilter: { [successKey]: val },
                      });
                  },
                  placeholder: "ערך...",
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (selectedType === "COUNT") {
      const filterKey = Object.keys(config.filter || {})[0] || "";
      const filterVal = (Object.values(config.filter || {})[0] as string) || "";

      return (
        <div className="space-y-6">
          {TableSelect()}
          {DateFilter()}
          {GroupByInput()}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              סינון (אופציונלי)
            </label>
            <div className="flex gap-2">
              {FieldSelect({
                value: filterKey,
                onChange: (key: string) => {
                  const val = key ? filterVal : "";
                  setConfig({ ...config, filter: key ? { [key]: val } : {} });
                },
                placeholder: "שדה...",
              })}
              {ValueInput({
                fieldName: filterKey,
                value: filterVal,
                onChange: (val: string) => {
                  if (filterKey)
                    setConfig({ ...config, filter: { [filterKey]: val } });
                },
                placeholder: "ערך...",
              })}
            </div>
            <p className="text-xs text-gray-500">רק רשומות שתואמות יספרו.</p>
          </div>
        </div>
      );
    }

    if (selectedType === "GRAPH") {
      const selectedGraphType = GRAPH_TYPES.find(
        (t) => t.id === config.chartType,
      );

      return (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800">
            {selectedGraphType && <selectedGraphType.icon size={20} />}
            <span className="font-medium">
              נבחר סוג: {selectedGraphType?.label || "גרף"}
            </span>
            <button
              onClick={() => setStep(1)}
              className="mr-auto text-xs underline hover:text-blue-600"
            >
              שנה סוג
            </button>
          </div>

          {TableSelect()}
          {DateFilter()}

          <div className="grid grid-cols-1 gap-4">
            {FieldSelect({
              label: "ציר X (לפי מה לקבץ?)",
              value: config.groupByField || "",
              onChange: (val: string) => {
                setConfig({ ...config, groupByField: val });
              },
              placeholder: "בחר שדה (למשל: סטטוס, חודש, נציג)...",
            })}
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              ציר Y (מה לחשב?)
            </label>
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="yMeasure"
                    checked={
                      !config.yAxisMeasure || config.yAxisMeasure === "count"
                    }
                    onChange={() =>
                      setConfig({
                        ...config,
                        yAxisMeasure: "count",
                        yAxisField: undefined,
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span>ספירת כמות רשומות</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="yMeasure"
                    checked={
                      config.yAxisMeasure === "sum" ||
                      config.yAxisMeasure === "avg"
                    }
                    onChange={() =>
                      setConfig({ ...config, yAxisMeasure: "sum" })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span>חישוב שדה מספרי (סכום/ממוצע)</span>
                </label>
              </div>

              {(config.yAxisMeasure === "sum" ||
                config.yAxisMeasure === "avg") && (
                <div className="flex gap-2 items-end animate-in fade-in slide-in-from-top-2">
                  <div className="w-32">
                    <label className="text-xs text-gray-500 mb-1 block">
                      פעולה
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-md p-2 text-sm"
                      value={config.yAxisMeasure || "sum"}
                      onChange={(e) =>
                        setConfig({ ...config, yAxisMeasure: e.target.value })
                      }
                    >
                      <option value="sum">סכום (Sum)</option>
                      <option value="avg">ממוצע (Avg)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    {FieldSelect({
                      label: "שדה לחישוב",
                      value: config.yAxisField || "",
                      onChange: (val: string) => {
                        setConfig({ ...config, yAxisField: val });
                      },
                      placeholder: "בחר שדה (למשל: סכום עסקה)...",
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            {initialData ? "עריכת תצוגת ניתוח" : "יצירת תצוגת ניתוח חדשה"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Plan Limits Banner */}
          {!loadingLimits &&
            limitsData &&
            limitsData.plan !== "super" &&
            !initialData && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <AlertCircle size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">
                      תוכנית: {PLAN_LABELS[limitsData.plan] || limitsData.plan}
                    </div>
                    <div className="text-sm text-gray-600 mt-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>אנליטיקות רגילות:</span>
                        <span className="font-medium">
                          {limitsData.currentCounts.regular} /{" "}
                          {limitsData.limits.regular}
                          <span className="text-gray-400 mr-1">
                            (נשארו {limitsData.remaining.regular})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>גרפים:</span>
                        <span className="font-medium">
                          {limitsData.currentCounts.graph} /{" "}
                          {limitsData.limits.graph}
                          <span className="text-gray-400 mr-1">
                            (נשארו {limitsData.remaining.graph})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Submit Error */}
          {submitError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {submitError}
            </div>
          )}

          {/* Title Input always nice to have */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              כותרת התצוגה
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: יחס המרה ערוצים, משימות פתוחות..."
              className="w-full border border-gray-300 rounded-md p-2 text-right"
              autoFocus
            />
          </div>

          <div className="mb-8">
            {(() => {
              const totalSteps = isGraphSubflow ? 3 : 2;
              const displayStep = isGraphSubflow
                ? step === 1
                  ? 2
                  : 3
                : step;

              return (
                <div className="flex items-center gap-4 mb-4">
                  {Array.from({ length: totalSteps }, (_, i) => {
                    const dotNum = i + 1;
                    const isCompleted = dotNum < displayStep;
                    const isCurrent = dotNum === displayStep;
                    return (
                      <Fragment key={dotNum}>
                        {i > 0 && (
                          <div
                            className={`h-1 flex-1 rounded-full ${
                              isCompleted ? "bg-green-500" : "bg-gray-200"
                            }`}
                          />
                        )}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            isCompleted
                              ? "bg-green-500 text-white"
                              : isCurrent
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {isCompleted ? <Check size={16} /> : dotNum}
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              );
            })()}
            {step === 1 ? (
              renderStep1()
            ) : (
              <>
                {renderStep2()}
                {selectedType !== "GRAPH" && renderPreview()}
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between bg-gray-50 rounded-b-lg">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md flex items-center gap-2"
            >
              <ChevronRight size={20} />
              חזור
            </button>
          ) : step === 1 && internalMode === "graph" ? (
            <button
              onClick={() => setInternalMode(null)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md flex items-center gap-2"
            >
              <ChevronRight size={20} />
              חזור
            </button>
          ) : (
            <div></div>
          )}

          {step === 1 ? (
            <button
              onClick={() => {
                // If GRAPH type is selected from general mode, enter graph sub-flow
                if (selectedType === "GRAPH" && mode !== "graph" && !internalMode) {
                  setInternalMode("graph");
                  return; // Stay on step 1, which now shows GRAPH_TYPES
                }
                // Otherwise proceed to step 2
                setStep(2);
              }}
              disabled={
                effectiveMode === "graph"
                  ? !config.chartType // In graph mode, need a chart type selected
                  : !selectedType // In general mode, need a view type selected
              }
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              המשך
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div className="flex gap-3">
              {/* Preview Button - Only for non-GRAPH types */}
              {selectedType !== "GRAPH" && (
                <button
                  onClick={handlePreview}
                  disabled={
                    previewLoading || (!config.tableId && !config.model)
                  }
                  className="px-4 py-2 bg-white border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {previewLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Eye size={18} />
                  )}
                  תצוגה מקדימה
                </button>
              )}
              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  !title ||
                  (selectedType === "CONVERSION" &&
                    !config.tableId &&
                    !config.model)
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {loading
                  ? "שומר..."
                  : initialData
                    ? "שמור שינויים"
                    : "צור תצוגה"}
                {!loading && <Check size={20} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
