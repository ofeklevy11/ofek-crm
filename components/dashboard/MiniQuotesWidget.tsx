"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Eye, EyeOff, Settings2 } from "lucide-react";
import { useEffect, useState, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { updateDashboardWidgetSettings } from "@/app/actions/dashboard-widgets";
import { getMiniQuotesData } from "@/app/actions/dashboard-mini-widgets";

interface QuoteItem {
  id: string;
  quoteNumber: number | null;
  clientName: string;
  title: string | null;
  total: number;
  status: string;
  currency: string;
  createdAt: string;
  validUntil: string | null;
  items: { description: string; product: { name: string } | null }[];
}

interface MiniQuotesWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  settings?: any;
  onOpenSettings?: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "טיוטה", color: "text-slate-700", bg: "bg-slate-200" },
  SENT: { label: "נשלחה", color: "text-cyan-700", bg: "bg-cyan-100" },
  ACCEPTED: { label: "אושרה", color: "text-green-700", bg: "bg-green-100" },
  REJECTED: { label: "נדחתה", color: "text-red-700", bg: "bg-red-100" },
};

const CURRENCY_MAP: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

const PRESET_LABELS: Record<string, string> = {
  recent: "אחרונות",
  this_month: "החודש",
  pending: "ממתינות",
  closed: "עסקאות סגורות",
  custom: "מותאם אישית",
};

function MiniQuotesWidget({
  id,
  onRemove,
  settings,
  onOpenSettings,
}: MiniQuotesWidgetProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  const [isCollapsed, setIsCollapsed] = useState(settings?.collapsed || false);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [summary, setSummary] = useState<Record<string, { count: number; total: number }>>({});
  const [loading, setLoading] = useState(true);

  // Build filters from settings
  const filters = useMemo(() => {
    if (!settings) return undefined;
    return {
      preset: settings.preset,
      statusFilter: settings.statusFilter,
      datePreset: settings.datePreset,
      dateFrom: settings.dateFrom,
      dateTo: settings.dateTo,
      currencyFilter: settings.currencyFilter,
      sortBy: settings.sortBy,
      maxQuotes: settings.maxQuotes,
    };
  }, [settings]);

  const settingsKey = useMemo(
    () => JSON.stringify(filters || {}),
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    getMiniQuotesData(filters)
      .then((res) => {
        if (res.success && res.data) {
          setQuotes(res.data.quotes as unknown as QuoteItem[]);
          setSummary(res.data.summary);
        }
      })
      .finally(() => setLoading(false));
  }, [settingsKey]);

  const handleToggleCollapse = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    try {
      await updateDashboardWidgetSettings(id, {
        ...(settings || {}),
        collapsed: newCollapsed,
      });
      router.refresh();
    } catch {
      setIsCollapsed(!newCollapsed);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const sym = CURRENCY_MAP[currency] || currency;
    return `${sym}${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(amount)}`;
  };

  // Filter summary
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const preset = settings?.preset || "recent";
    parts.push(PRESET_LABELS[preset] || "אחרונות");

    if (settings?.currencyFilter?.length) {
      const labels = settings.currencyFilter.map((c: string) => CURRENCY_MAP[c] ? `${CURRENCY_MAP[c]} ${c}` : c);
      parts.push(labels.join(", "));
    }

    return parts.join(" · ");
  }, [settings]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-indigo-100 overflow-hidden cursor-grab active:cursor-grabbing ${
        isCollapsed ? "h-auto" : "h-full min-h-[300px]"
      }`}
    >
      <div className="h-1.5 w-full bg-linear-to-r from-indigo-400 to-violet-500" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100">
                הצעות מחיר
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {filterSummary}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">הצעות מחיר אחרונות</h3>
            <p className="text-sm text-gray-500">{quotes.length} הצעות</p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onOpenSettings && (
              <button
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(id);
                }}
                title="הגדרות"
              >
                <Settings2 size={16} />
              </button>
            )}
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-md transition"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleToggleCollapse}
              title={isCollapsed ? "הצג" : "הסתר"}
            >
              {isCollapsed ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="הסר מהדאשבורד"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="flex-1 overflow-auto -mx-5 px-5" dir="rtl">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-2 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : quotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <p className="text-sm">אין הצעות מחיר</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status summary cards */}
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {(["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const).map((status) => {
                    const cfg = STATUS_CONFIG[status];
                    const data = summary[status];
                    return (
                      <div
                        key={status}
                        className={`rounded-lg p-2 text-center ${cfg.bg}`}
                      >
                        <p className={`text-lg font-bold ${cfg.color}`}>
                          {data?.count || 0}
                        </p>
                        <p className={`text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Quotes list */}
                <div className="grid grid-cols-2 gap-3">
                  {quotes.map((q) => {
                    const st = STATUS_CONFIG[q.status] || STATUS_CONFIG.DRAFT;
                    const productNames = q.items
                      ?.map((item) => item.product?.name || item.description)
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <div
                        key={q.id}
                        className="bg-gray-50 rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          {q.quoteNumber && (
                            <span className="text-sm text-gray-400 font-mono shrink-0">
                              #{q.quoteNumber}
                            </span>
                          )}
                          <p className="text-base font-medium text-gray-800 truncate">
                            {q.clientName}
                          </p>
                        </div>
                        {q.title && (
                          <p className="text-sm text-gray-500 truncate">
                            {q.title}
                          </p>
                        )}
                        {productNames && (
                          <p className="text-sm text-gray-500 truncate">
                            {productNames}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${st.bg} ${st.color}`}
                          >
                            {st.label}
                          </span>
                          <span className="text-sm font-semibold text-gray-700">
                            {formatAmount(q.total, q.currency)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(q.createdAt).toLocaleDateString("he-IL", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        {q.validUntil && (
                          <p className="text-xs text-gray-400">
                            תוקף: {new Date(q.validUntil).toLocaleDateString("he-IL", {
                              day: "numeric",
                              month: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MiniQuotesWidget);
