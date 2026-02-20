"use client";

import { useState } from "react";
import {
  Pencil,
  BarChart2,
  TrendingUp,
  Hash,
  Lightbulb,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TextEditor,
  SelectEditor,
  CHART_TYPE_OPTIONS,
  DATE_RANGE_OPTIONS,
  Y_AXIS_OPTIONS,
} from "./ReportElementEditor";

const SYSTEM_MODEL_NAMES: Record<string, string> = {
  Task: "משימות",
  Retainer: "ריטיינרים",
  OneTimePayment: "תשלומים חד-פעמיים",
  Transaction: "תנועות כספיות",
  CalendarEvent: "אירועי יומן",
};

const CHART_TYPE_NAMES: Record<string, string> = {
  bar: "עמודות",
  line: "קו",
  pie: "עוגה",
  area: "שטח",
};

const VIEW_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  COUNT: { label: "ספירה/פילוח", color: "bg-blue-100 text-blue-700" },
  CONVERSION: { label: "אחוז המרה", color: "bg-amber-100 text-amber-700" },
  GRAPH: { label: "גרף", color: "bg-purple-100 text-purple-700" },
};

interface AIReportView {
  id: string;
  title: string;
  type: "COUNT" | "CONVERSION" | "GRAPH";
  description: string;
  config: Record<string, any>;
}

interface AIReport {
  reportTitle: string;
  summary: string;
  insights: string[];
  views: AIReportView[];
}

interface ReportPreviewProps {
  report: AIReport;
  tables: any[];
  onUpdateReport: (updates: Partial<AIReport>) => void;
  onUpdateView: (viewId: string, updates: Partial<AIReportView>) => void;
}

export default function ReportPreview({
  report,
  tables,
  onUpdateReport,
  onUpdateView,
}: ReportPreviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [expandedViews, setExpandedViews] = useState<Set<string>>(new Set());

  const toggleExpand = (viewId: string) => {
    setExpandedViews((prev) => {
      const next = new Set(prev);
      if (next.has(viewId)) next.delete(viewId);
      else next.add(viewId);
      return next;
    });
  };

  const getDataSourceName = (config: Record<string, any>) => {
    if (config.model) return SYSTEM_MODEL_NAMES[config.model] || config.model;
    if (config.tableId) {
      const table = tables.find((t) => t.id === config.tableId);
      return table?.name || "טבלה לא ידועה";
    }
    return "לא ידוע";
  };

  const getFieldOptions = (config: Record<string, any>) => {
    if (config.tableId) {
      const table = tables.find((t) => t.id === config.tableId);
      if (table?.schemaJson) {
        let cols: any[] = [];
        if (typeof table.schemaJson === "string") {
          try { cols = JSON.parse(table.schemaJson); } catch {}
        } else if (Array.isArray(table.schemaJson)) {
          cols = table.schemaJson;
        }
        return cols.map((c: any) => ({
          value: c.systemName || c.name,
          label: c.label || c.name,
        }));
      }
    }
    return [];
  };

  const kpiViews = report.views.filter((v) => v.type === "COUNT" || v.type === "CONVERSION");
  const graphViews = report.views.filter((v) => v.type === "GRAPH");

  return (
    <div className="space-y-6 pb-4">
      {/* Report Title */}
      <div>
        {editingField === "reportTitle" ? (
          <TextEditor
            type="input"
            value={report.reportTitle}
            onSave={(val) => {
              onUpdateReport({ reportTitle: val });
              setEditingField(null);
            }}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">{report.reportTitle}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setEditingField("reportTitle")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Summary */}
      {report.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 p-2 rounded-lg shrink-0">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-blue-900">סיכום</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-blue-400 hover:text-blue-600"
                  onClick={() => setEditingField("summary")}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              {editingField === "summary" ? (
                <TextEditor
                  type="textarea"
                  value={report.summary}
                  onSave={(val) => {
                    onUpdateReport({ summary: val });
                    setEditingField(null);
                  }}
                  onCancel={() => setEditingField(null)}
                />
              ) : (
                <p className="text-sm text-blue-800 leading-relaxed">{report.summary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {kpiViews.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Hash className="h-4 w-4" />
            מדדים ({kpiViews.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {kpiViews.map((view) => (
              <ViewCard
                key={view.id}
                view={view}
                tables={tables}
                isExpanded={expandedViews.has(view.id)}
                onToggleExpand={() => toggleExpand(view.id)}
                editingField={editingField}
                setEditingField={setEditingField}
                onUpdateView={onUpdateView}
                getDataSourceName={getDataSourceName}
                getFieldOptions={getFieldOptions}
              />
            ))}
          </div>
        </div>
      )}

      {/* Graph Cards */}
      {graphViews.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            גרפים ({graphViews.length})
          </h3>
          <div className="space-y-3">
            {graphViews.map((view) => (
              <ViewCard
                key={view.id}
                view={view}
                tables={tables}
                isExpanded={expandedViews.has(view.id)}
                onToggleExpand={() => toggleExpand(view.id)}
                editingField={editingField}
                setEditingField={setEditingField}
                onUpdateView={onUpdateView}
                getDataSourceName={getDataSourceName}
                getFieldOptions={getFieldOptions}
              />
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {report.insights.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="bg-amber-100 p-2 rounded-lg shrink-0">
              <Lightbulb className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-900 mb-2">תובנות</h3>
              <ol className="space-y-2">
                {report.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold text-xs mt-0.5 shrink-0">{idx + 1}.</span>
                    {editingField === `insight-${idx}` ? (
                      <TextEditor
                        type="textarea"
                        value={insight}
                        onSave={(val) => {
                          const newInsights = [...report.insights];
                          newInsights[idx] = val;
                          onUpdateReport({ insights: newInsights });
                          setEditingField(null);
                        }}
                        onCancel={() => setEditingField(null)}
                      />
                    ) : (
                      <div className="group flex items-start gap-1 flex-1">
                        <span className="text-sm text-amber-800">{insight}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => setEditingField(`insight-${idx}`)}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual View Card
function ViewCard({
  view,
  tables,
  isExpanded,
  onToggleExpand,
  editingField,
  setEditingField,
  onUpdateView,
  getDataSourceName,
  getFieldOptions,
}: {
  view: AIReportView;
  tables: any[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  editingField: string | null;
  setEditingField: (field: string | null) => void;
  onUpdateView: (viewId: string, updates: Partial<AIReportView>) => void;
  getDataSourceName: (config: Record<string, any>) => string;
  getFieldOptions: (config: Record<string, any>) => { value: string; label: string }[];
}) {
  const typeInfo = VIEW_TYPE_LABELS[view.type] || VIEW_TYPE_LABELS.COUNT;
  const fieldOptions = getFieldOptions(view.config);

  const updateConfig = (key: string, value: any) => {
    onUpdateView(view.id, {
      config: { ...view.config, [key]: value },
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {view.type === "GRAPH" && view.config.chartType && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {CHART_TYPE_NAMES[view.config.chartType] || view.config.chartType}
              </span>
            )}
          </div>
          {editingField === `view-title-${view.id}` ? (
            <TextEditor
              type="input"
              value={view.title}
              onSave={(val) => {
                onUpdateView(view.id, { title: val });
                setEditingField(null);
              }}
              onCancel={() => setEditingField(null)}
            />
          ) : (
            <div className="group flex items-center gap-1">
              <h4 className="font-bold text-gray-900 text-sm truncate">{view.title}</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => setEditingField(`view-title-${view.id}`)}
              >
                <Pencil className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-0.5">מקור: {getDataSourceName(view.config)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-gray-400"
          onClick={onToggleExpand}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Expanded Config Details */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50/50 space-y-3">
          {/* Description */}
          {editingField === `view-desc-${view.id}` ? (
            <TextEditor
              type="textarea"
              value={view.description || ""}
              onSave={(val) => {
                onUpdateView(view.id, { description: val });
                setEditingField(null);
              }}
              onCancel={() => setEditingField(null)}
              placeholder="תיאור..."
            />
          ) : (
            <div className="group flex items-start gap-1">
              <p className="text-xs text-gray-600">{view.description || "ללא תיאור"}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => setEditingField(`view-desc-${view.id}`)}
              >
                <Pencil className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}

          {/* Config Editors */}
          <div className="grid grid-cols-2 gap-2">
            {/* Date Range */}
            <SelectEditor
              label="טווח זמן"
              value={view.config.dateRangeType || "all"}
              options={DATE_RANGE_OPTIONS}
              onSave={(val) => updateConfig("dateRangeType", val)}
            />

            {/* Group By Field (if available) */}
            {view.config.groupByField && fieldOptions.length > 0 && (
              <SelectEditor
                label="קבץ לפי"
                value={view.config.groupByField}
                options={fieldOptions}
                onSave={(val) => updateConfig("groupByField", val)}
              />
            )}

            {/* Chart Type (for GRAPH) */}
            {view.type === "GRAPH" && (
              <SelectEditor
                label="סוג גרף"
                value={view.config.chartType || "bar"}
                options={CHART_TYPE_OPTIONS}
                onSave={(val) => updateConfig("chartType", val)}
              />
            )}

            {/* Y-Axis Measure (for GRAPH) */}
            {view.type === "GRAPH" && (
              <SelectEditor
                label="מדד"
                value={view.config.yAxisMeasure || "count"}
                options={Y_AXIS_OPTIONS}
                onSave={(val) => updateConfig("yAxisMeasure", val)}
              />
            )}
          </div>

          {/* Filters display */}
          {view.config.filter && Object.keys(view.config.filter).length > 0 && (
            <div className="text-xs">
              <span className="text-gray-400 font-medium">סינון: </span>
              {Object.entries(view.config.filter).map(([k, v]) => (
                <span key={k} className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 mr-1">
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}

          {view.type === "CONVERSION" && (
            <div className="space-y-1 text-xs">
              {view.config.totalFilter && (
                <div>
                  <span className="text-gray-400 font-medium">סינון כולל: </span>
                  {Object.entries(view.config.totalFilter).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 mr-1">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {view.config.successFilter && (
                <div>
                  <span className="text-gray-400 font-medium">סינון הצלחה: </span>
                  {Object.entries(view.config.successFilter).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 mr-1">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
