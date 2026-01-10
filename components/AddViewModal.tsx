"use client";

import { useState } from "react";
import { createView, ViewConfig } from "@/app/actions/views";
import { useRouter } from "next/navigation";

interface AddViewModalProps {
  tableId: number;
  tableSlug: string;
  schema: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
  }>;
  onClose: () => void;
}

export default function AddViewModal({
  tableId,
  tableSlug,
  schema,
  onClose,
}: AddViewModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [viewType, setViewType] = useState<
    "stats" | "aggregation" | "legend" | "chart"
  >("stats");
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all">("week");
  const [aggregationType, setAggregationType] = useState<
    "sum" | "count" | "avg" | "group"
  >("count");
  const [targetField, setTargetField] = useState("");
  const [targetFields, setTargetFields] = useState<string[]>([]);
  const [groupByField, setGroupByField] = useState("");

  // Filter state for count aggregation
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState("equals");
  const [filterValue, setFilterValue] = useState("");

  // Date filter state
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [dateField, setDateField] = useState("");
  const [dateFilterType, setDateFilterType] = useState<
    "week" | "month" | "custom" | "all"
  >("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Legend color mapping state
  const [legendField, setLegendField] = useState("");
  const [colorMappings, setColorMappings] = useState<
    Record<string, { color: string; description?: string; priority?: number }>
  >({});

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === name.toLowerCase().replace(/\s+/g, "-")) {
      setSlug(value.toLowerCase().replace(/\s+/g, "-"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Build config based on view type
    const config: ViewConfig = {
      type: viewType,
      title: name,
    };

    if (viewType === "stats") {
      config.timeRange = timeRange;
    } else if (viewType === "aggregation") {
      config.aggregationType = aggregationType;
      if (aggregationType === "group") {
        config.groupByField = groupByField;
        if (targetField) config.targetField = targetField;
        if (targetFields.length > 0) config.targetFields = targetFields;
      } else if (aggregationType !== "count") {
        // For sum/avg, targetField is required
        config.targetField = targetField;
        if (targetFields.length > 0) config.targetFields = targetFields;
      }
    } else if (viewType === "legend") {
      // Add color mapping configuration
      if (legendField && Object.keys(colorMappings).length > 0) {
        config.legendField = legendField;
        config.colorMappings = colorMappings;
        // Build legend items array for backward compatibility
        config.legendItems = Object.entries(colorMappings).map(
          ([value, mapping]) => ({
            label: value,
            color: mapping.color,
            description: mapping.description,
          })
        );
      }
    }

    // Apply General Filters (for stats and aggregation)
    if (
      (viewType === "stats" || viewType === "aggregation") &&
      filterField &&
      filterValue
    ) {
      config.filters = [
        {
          field: filterField,
          operator: filterOperator as any,
          value: filterValue,
        },
      ];
    }

    // Add date filter if enabled
    if (useDateFilter && dateField) {
      config.dateFilter = {
        field: dateField,
        type: dateFilterType,
        ...(dateFilterType === "custom" && {
          startDate,
          endDate,
        }),
      };
    }

    const result = await createView({
      tableId,
      name,
      slug: `${tableSlug}_${slug}`,
      config,
      isEnabled: true,
    });

    setIsSubmitting(false);

    if (result.success) {
      router.refresh();
      onClose();
    } else {
      setError(result.error || "Failed to create view");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900">יצירת תצוגה חדשה</h2>
          <p className="text-sm text-gray-500 mt-1">
            תצוגות מאפשרות לך להציג סטטיסטיקות, אגרגציות וניתוחים על הנתונים שלך
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* View Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              שם התצוגה <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder='לדוגמה: "לידים חדשים השבוע", "סיכום הכנסות"'
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">השם יוצג בכותרת התצוגה</p>
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מזהה ייחודי <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{tableSlug}_</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder='לדוגמה: "new-leads-week"'
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              מזהה טכני - יווצר אוטומטית מהשם אבל ניתן לעריכה
            </p>
          </div>

          {/* View Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סוג התצוגה <span className="text-red-500">*</span>
            </label>
            <select
              value={viewType}
              onChange={(e) =>
                setViewType(
                  e.target.value as "stats" | "aggregation" | "legend" | "chart"
                )
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="stats">📊 סטטיסטיקות לפי זמן</option>
              <option value="aggregation">🔢 חישובים ואגרגציות</option>
              <option value="legend">🎨 מקרא צבעים</option>
              <option value="chart">📈 גרפים (בקרוב)</option>
            </select>
            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                {viewType === "stats" && (
                  <>
                    <strong>סטטיסטיקות לפי זמן:</strong> מציג כמות רשומות חדשות
                    בתקופה נבחרת (שבוע/חודש/הכל)
                  </>
                )}
                {viewType === "aggregation" && (
                  <>
                    <strong>חישובים ואגרגציות:</strong> מבצע חישובים כמו סכום,
                    ספירה, ממוצע, או קיבוץ לפי שדה
                  </>
                )}
                {viewType === "legend" && (
                  <>
                    <strong>מקרא צבעים:</strong> מציג הסבר על משמעות הצבעים
                    בטבלה
                  </>
                )}
                {viewType === "chart" && (
                  <>
                    <strong>גרפים:</strong> יציג את הנתונים בצורה ויזואלית
                    (בפיתוח)
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Stats-specific options */}
          {viewType === "stats" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                טווח זמן
              </label>
              <select
                value={timeRange}
                onChange={(e) =>
                  setTimeRange(e.target.value as "week" | "month" | "all")
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="week">📅 השבוע הנוכחי</option>
                <option value="month">📆 החודש הנוכחי</option>
                <option value="all">🗓️ כל הזמנים</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                התצוגה תספור רק רשומות שנוצרו בטווח הזמן שנבחר
              </p>
            </div>
          )}

          {/* General Filters - for Stats and Aggregation */}
          {(viewType === "stats" || viewType === "aggregation") && (
            <div className="border-t border-gray-200 pt-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    סינון לפי שדה (אופציונלי)
                  </label>
                  <select
                    value={filterField}
                    onChange={(e) => {
                      setFilterField(e.target.value);
                      setFilterValue(""); // Reset value when field changes
                      setFilterOperator("equals"); // Reset operator
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">ללא סינון נוסף</option>
                    {schema.map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label} ({field.type})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {filterField
                      ? `התצוגה תכלול רק רשומות שבשדה "${
                          schema.find((f) => f.name === filterField)?.label
                        }" יש את הערך שתבחר למטה`
                      : "הצג את כל הרשומות (ללא סינון)"}
                  </p>
                </div>

                {filterField &&
                  (() => {
                    const field = schema.find((f) => f.name === filterField);
                    if (!field) return null;

                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ערך לסינון <span className="text-red-500">*</span>
                        </label>
                        {field.type === "select" && field.options ? (
                          <div className="relative">
                            <select
                              value={filterValue}
                              onChange={(e) => setFilterValue(e.target.value)}
                              required={!!filterField}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none"
                            >
                              <option value="">בחר ערך...</option>
                              {field.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-700">
                              <svg
                                className="fill-current h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                              </svg>
                            </div>
                          </div>
                        ) : field.type === "boolean" ? (
                          <div className="relative">
                            <select
                              value={filterValue}
                              onChange={(e) => setFilterValue(e.target.value)}
                              required={!!filterField}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none"
                            >
                              <option value="">בחר...</option>
                              <option value="true">כן</option>
                              <option value="false">לא</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-700">
                              <svg
                                className="fill-current h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                              </svg>
                            </div>
                          </div>
                        ) : field.type === "number" ? (
                          <div className="flex gap-2">
                            <select
                              value={filterOperator}
                              onChange={(e) =>
                                setFilterOperator(e.target.value)
                              }
                              className="w-1/3 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                            >
                              <option value="equals">שווה ל (=)</option>
                              <option value="gt">גדול מ (&gt;)</option>
                              <option value="lt">קטן מ (&lt;)</option>
                              <option value="gte">גדול או שווה (&ge;)</option>
                              <option value="lte">קטן או שווה (&le;)</option>
                              <option value="neq">שונה מ (!=)</option>
                            </select>
                            <input
                              type="number"
                              value={filterValue}
                              onChange={(e) => setFilterValue(e.target.value)}
                              required={!!filterField}
                              placeholder="מספר..."
                              className="w-2/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            />
                          </div>
                        ) : field.type === "date" ? (
                          <input
                            type="date"
                            value={filterValue}
                            onChange={(e) => setFilterValue(e.target.value)}
                            required={!!filterField}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={filterValue}
                            onChange={(e) => setFilterValue(e.target.value)}
                            required={!!filterField}
                            placeholder={`הכנס ${
                              field.type === "text" ||
                              field.type === "long-text"
                                ? "טקסט"
                                : "ערך"
                            }...`}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          סוג שדה: {field.type}
                        </p>
                      </div>
                    );
                  })()}
              </div>
            </div>
          )}

          {/* Aggregation-specific options */}
          {viewType === "aggregation" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  סוג החישוב
                </label>
                <select
                  value={aggregationType}
                  onChange={(e) =>
                    setAggregationType(
                      e.target.value as "sum" | "count" | "avg" | "group"
                    )
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="count">🔢 ספירה - כמה רשומות יש</option>
                  <option value="sum">➕ סכום - סיכום מספרים</option>
                  <option value="avg">➗ ממוצע - ממוצע של מספרים</option>
                  <option value="group">📊 קיבוץ - חלוקה לפי קטגוריות</option>
                </select>
                <div className="mt-2 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    {aggregationType === "count" && (
                      <>
                        <strong>ספירה:</strong> סופר כמה רשומות יש בסך הכל
                      </>
                    )}
                    {aggregationType === "sum" && (
                      <>
                        <strong>סכום:</strong> מחבר את כל הערכים בשדה מספרי
                        (למשל: סכום הכנסות)
                      </>
                    )}
                    {aggregationType === "avg" && (
                      <>
                        <strong>ממוצע:</strong> מחשב ממוצע של שדה מספרי
                      </>
                    )}
                    {aggregationType === "group" && (
                      <>
                        <strong>קיבוץ:</strong> מחלק את הנתונים לפי קטגוריות
                        ומציג כמה יש מכל סוג
                      </>
                    )}
                  </p>
                </div>
              </div>

              {aggregationType === "group" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      שדה לקיבוץ <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={groupByField}
                      onChange={(e) => setGroupByField(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">בחר שדה לקיבוץ...</option>
                      {schema
                        .filter(
                          (f) =>
                            f.type === "select" || f.type === "multi-select"
                        )
                        .map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      התצוגה תחלק את הנתונים לפי הערכים השונים בשדה הזה
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      שדה לסיכום (אופציונלי)
                    </label>
                    <select
                      value={targetField}
                      onChange={(e) => setTargetField(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">ללא שדה נוסף - רק ספירה</option>
                      {schema
                        .filter((f) => f.type === "number")
                        .map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label} (סכום/ממוצע)
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      אם תבחר שדה, התצוגה תציג גם סכום וממוצע של השדה הזה לכל
                      קבוצה
                    </p>
                  </div>
                </>
              ) : (
                aggregationType !== "count" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      שדה לחישוב <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={targetField}
                      onChange={(e) => setTargetField(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">בחר שדה מספרי...</option>
                      {schema
                        .filter((f) => f.type === "number")
                        .map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                    </select>
                    {schema.filter((f) => f.type === "number").length === 0 ? (
                      <p className="text-xs text-red-500 mt-1">
                        ⚠️ אין שדות מספריים בטבלה הזו. הוסף שדה מסוג "מספר"
                        בהגדרות הטבלה כדי להשתמש בחישובים.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        השדה שעליו יבוצע החישוב (
                        {aggregationType === "sum" ? "סכום" : "ממוצע"})
                      </p>
                    )}
                  </div>
                )
              )}
            </>
          )}

          {/* Legend-specific options */}
          {viewType === "legend" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  בחר שדה לצביעה <span className="text-red-500">*</span>
                </label>
                <select
                  value={legendField}
                  onChange={(e) => {
                    const field = e.target.value;
                    setLegendField(field);
                    // Initialize color mappings for all options
                    if (field) {
                      const selectedField = schema.find(
                        (f) => f.name === field
                      );
                      if (selectedField?.options) {
                        const newMappings: Record<
                          string,
                          {
                            color: string;
                            description?: string;
                            priority?: number;
                          }
                        > = {};
                        selectedField.options.forEach((opt) => {
                          newMappings[opt] = {
                            color: colorMappings[opt]?.color || "#e5e7eb",
                            description: colorMappings[opt]?.description || "",
                            priority: colorMappings[opt]?.priority || 0,
                          };
                        });
                        setColorMappings(newMappings);
                      }
                    }
                  }}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">בחר שדה...</option>
                  {schema
                    .filter(
                      (f) => f.type === "select" || f.type === "multi-select"
                    )
                    .map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  השדה שעל פיו יצבעו השורות בטבלה
                </p>
              </div>

              {legendField && Object.keys(colorMappings).length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    הגדר צבעים לכל ערך:
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(colorMappings).map(([value, mapping]) => (
                      <div
                        key={value}
                        className="bg-white p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <input
                            type="color"
                            value={mapping.color}
                            onChange={(e) =>
                              setColorMappings((prev) => ({
                                ...prev,
                                [value]: {
                                  ...prev[value],
                                  color: e.target.value,
                                },
                              }))
                            }
                            className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                          />
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-500">
                              עדיפות:
                            </label>
                            <input
                              type="number"
                              value={mapping.priority ?? 0}
                              onChange={(e) =>
                                setColorMappings((prev) => ({
                                  ...prev,
                                  [value]: {
                                    ...prev[value],
                                    priority: parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900 flex-1">
                            {value}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={mapping.description || ""}
                          onChange={(e) =>
                            setColorMappings((prev) => ({
                              ...prev,
                              [value]: {
                                ...prev[value],
                                description: e.target.value,
                              },
                            }))
                          }
                          placeholder="תיאור אופציונלי..."
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date Filter Section - for non-stats views (stats has its own time range) */}
          {viewType !== "stats" && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  📅 פילטר לפי תאריך (אופציונלי)
                </label>
                <button
                  type="button"
                  onClick={() => setUseDateFilter(!useDateFilter)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    useDateFilter
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {useDateFilter ? "ON" : "OFF"}
                </button>
              </div>

              {useDateFilter && (
                <div className="space-y-4 bg-blue-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      בחר שדה תאריך <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={dateField}
                      onChange={(e) => setDateField(e.target.value)}
                      required={useDateFilter}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">בחר שדה...</option>
                      {schema
                        .filter(
                          (f) =>
                            f.type === "date" ||
                            f.name.toLowerCase().includes("date") ||
                            f.name.toLowerCase().includes("created")
                        )
                        .map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                      <option value="createdAt">תאריך יצירה (createdAt)</option>
                      <option value="updatedAt">תאריך עדכון (updatedAt)</option>
                    </select>
                    <p className="text-xs text-gray-600 mt-1">
                      התצוגה תציג רק רשומות מהתקופה שנבחרה
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      טווח תאריכים
                    </label>
                    <select
                      value={dateFilterType}
                      onChange={(e) =>
                        setDateFilterType(
                          e.target.value as "week" | "month" | "custom" | "all"
                        )
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="all">🗓️ כל הזמנים (ללא פילטר)</option>
                      <option value="week">📅 7 ימים אחרונים</option>
                      <option value="month">📆 30 ימים אחרונים</option>
                      <option value="custom">🔧 טווח מותאם אישית</option>
                    </select>
                  </div>

                  {dateFilterType === "custom" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          מתאריך
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          עד תאריך
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "יוצר תצוגה..." : "צור תצוגה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
