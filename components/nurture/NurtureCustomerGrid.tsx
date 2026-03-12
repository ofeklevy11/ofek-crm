"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NurtureSubscriberResult } from "@/app/nurture-hub/actions";

interface DateColumnConfig {
  label: string;
  render: (customer: NurtureSubscriberResult) => React.ReactNode;
}

interface Props {
  customers: NurtureSubscriberResult[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  lastSentMap: Record<string, string>;
  selectedCustomerIds: Set<string>;
  sendingCustomerId: string | null;
  quotaRemaining: number;
  isQuotaUnlimited: boolean;
  dateColumn?: DateColumnConfig;
  accentColor: string; // e.g. "pink", "amber", "emerald", "indigo", "slate"
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  onCustomerClick: (customer: NurtureSubscriberResult) => void;
  onSendToCustomer: (customer: NurtureSubscriberResult) => void;
  onLoadMore: () => void;
  hasActiveSearch?: boolean;
  onClearSearch?: () => void;
}

const ACCENT_STYLES: Record<string, { avatar: string; sendBtn: string }> = {
  pink: { avatar: "bg-indigo-100 text-indigo-600", sendBtn: "bg-pink-50 text-pink-600 hover:bg-pink-100" },
  amber: { avatar: "bg-amber-100 text-amber-600", sendBtn: "bg-amber-50 text-amber-600 hover:bg-amber-100" },
  emerald: { avatar: "bg-emerald-100 text-emerald-600", sendBtn: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" },
  indigo: { avatar: "bg-indigo-100 text-indigo-600", sendBtn: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100" },
  slate: { avatar: "bg-slate-100 text-slate-600", sendBtn: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
  blue: { avatar: "bg-blue-100 text-blue-600", sendBtn: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
  orange: { avatar: "bg-orange-100 text-orange-600", sendBtn: "bg-orange-50 text-orange-600 hover:bg-orange-100" },
};

export default function NurtureCustomerGrid({
  customers,
  total,
  hasMore,
  isLoading,
  isLoadingMore,
  lastSentMap,
  selectedCustomerIds,
  sendingCustomerId,
  quotaRemaining,
  isQuotaUnlimited,
  dateColumn,
  accentColor,
  onToggleSelection,
  onToggleAll,
  onCustomerClick,
  onSendToCustomer,
  onLoadMore,
  hasActiveSearch,
  onClearSearch,
}: Props) {
  const style = ACCENT_STYLES[accentColor] || ACCENT_STYLES.indigo;

  // Loading skeleton
  if (isLoading && customers.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="col-span-2 h-4 bg-slate-200 rounded animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 px-3 py-3 border-b border-slate-50">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="col-span-2 h-4 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (customers.length === 0 && !isLoading) {
    if (hasActiveSearch) {
      return (
        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm space-y-2">
          <p>לא נמצאו תוצאות לחיפוש</p>
          {onClearSearch && (
            <Button variant="outline" size="sm" onClick={onClearSearch} className="text-xs">
              נקה חיפוש
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm">
        עדיין אין לקוחות ברשימה. לחץ על &quot;הוסף לקוחות&quot; כדי להתחיל.
      </div>
    );
  }

  // Column spans: with dateColumn = 1+2+2+2+2+2+1, without = 1+2+3+2+2+2
  const colName = 2;
  const colDate = dateColumn ? 2 : 0;
  const colContact = dateColumn ? 2 : 3;
  const colSource = 2;
  const colLastSent = 2;
  const colSend = dateColumn ? 1 : 1;

  return (
    <div>
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-500">
          <div className="col-span-1 flex items-center justify-center">
            <input
              type="checkbox"
              checked={selectedCustomerIds.size === customers.length && customers.length > 0}
              onChange={onToggleAll}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
            />
          </div>
          <div className={`col-span-${colName}`}>שם</div>
          {dateColumn && <div className={`col-span-${colDate}`}>{dateColumn.label}</div>}
          <div className={`col-span-${colContact}`}>פרטי קשר</div>
          <div className={`col-span-${colSource}`}>מקור</div>
          <div className={`col-span-${colLastSent} text-center`}>שליחה אחרונה</div>
          <div className={`col-span-${colSend} text-center`}>שליחה</div>
        </div>

        {/* List */}
        <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-100">
          {customers.map((c) => (
            <div
              key={c.id}
              className={cn(
                "grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group items-center",
                selectedCustomerIds.has(c.id) && "bg-indigo-50/50"
              )}
              onClick={() => onCustomerClick(c)}
            >
              <div className="col-span-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedCustomerIds.has(c.id)}
                  onChange={() => onToggleSelection(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                />
              </div>
              <div className={`col-span-${colName} flex items-center gap-2 overflow-hidden`}>
                <div className={`w-7 h-7 rounded-full ${style.avatar} flex items-center justify-center text-xs font-bold shrink-0`}>
                  {c.name.slice(0, 2)}
                </div>
                <span className="text-sm font-medium text-slate-900 truncate">{c.name}</span>
              </div>
              {dateColumn && (
                <div className={`col-span-${colDate} flex items-center text-xs text-slate-600`}>
                  {dateColumn.render(c)}
                </div>
              )}
              <div className={`col-span-${colContact} flex items-center text-xs text-slate-600 truncate`}>
                {c.email || c.phone || "\u2014"}
              </div>
              <div className={`col-span-${colSource} flex items-center gap-1.5`}>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    c.source === "Table Automation"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {c.source === "Manual" ? "ידני" : c.source === "Table Automation" ? "אוטומציה" : c.source}
                </span>
                {c.source === "Table Automation" && c.sourceTableName && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                    {c.sourceTableName}
                  </span>
                )}
              </div>
              <div className={`col-span-${colLastSent} flex items-center justify-center`}>
                {lastSentMap[c.id] ? (
                  <span className="text-[10px] text-slate-400">
                    {new Date(lastSentMap[c.id]).toLocaleDateString("he-IL")}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-300">&mdash;</span>
                )}
              </div>
              <div className={`col-span-${colSend} flex items-center justify-center`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToCustomer(c);
                  }}
                  disabled={sendingCustomerId === c.id || !c.phone || !c.phoneActive || (!isQuotaUnlimited && quotaRemaining <= 0)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded ${style.sendBtn} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                  title={!c.phone || !c.phoneActive ? "אין מספר טלפון פעיל" : `שלח ל-${c.name}`}
                >
                  {sendingCustomerId === c.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  שלח
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Load More */}
      {(hasMore || isLoadingMore) && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-slate-500">
            מציג {customers.length} מתוך {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-xs h-7 gap-1"
          >
            {isLoadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            טען עוד
          </Button>
        </div>
      )}
    </div>
  );
}
