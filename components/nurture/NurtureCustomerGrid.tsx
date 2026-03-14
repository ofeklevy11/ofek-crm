"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2, Trash2 } from "lucide-react";
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
  onBulkSend?: () => void;
  onBulkDelete?: () => void;
  isDeletingBulk?: boolean;
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
  onBulkSend,
  onBulkDelete,
  isDeletingBulk,
  hasActiveSearch,
  onClearSearch,
}: Props) {
  const style = ACCENT_STYLES[accentColor] || ACCENT_STYLES.indigo;

  // Loading skeleton
  if (isLoading && customers.length === 0) {
    return (
      <div role="status" aria-busy="true" className="border rounded-lg overflow-hidden">
        <span className="sr-only">טוען נתונים...</span>
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
        <div role="status" className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm space-y-2">
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
      <div role="status" className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed text-sm">
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
      <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
        <table className="w-full table-fixed">
          <caption className="sr-only">רשימת לקוחות</caption>
          <colgroup>
            <col style={{ width: "8.33%" }} />
            <col style={{ width: `${colName * 8.33}%` }} />
            {dateColumn && <col style={{ width: `${colDate * 8.33}%` }} />}
            <col style={{ width: `${colContact * 8.33}%` }} />
            <col style={{ width: `${colSource * 8.33}%` }} />
            <col style={{ width: `${colLastSent * 8.33}%` }} />
            <col style={{ width: `${colSend * 8.33}%` }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-xs font-medium text-slate-500 border-b">
              <th scope="col" className="px-3 py-2 text-center font-medium">
                <input
                  type="checkbox"
                  checked={selectedCustomerIds.size === customers.length && customers.length > 0}
                  onChange={onToggleAll}
                  aria-label="בחר הכל"
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                />
              </th>
              <th scope="col" className="px-1 py-2 text-right font-medium">שם</th>
              {dateColumn && <th scope="col" className="px-1 py-2 text-right font-medium">{dateColumn.label}</th>}
              <th scope="col" className="px-1 py-2 text-right font-medium">פרטי קשר</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">מקור</th>
              <th scope="col" className="px-1 py-2 text-center font-medium">שליחה אחרונה</th>
              <th scope="col" className="px-1 py-2 text-center font-medium">שליחה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr
                key={c.id}
                className={cn(
                  "hover:bg-slate-50 transition-colors group",
                  selectedCustomerIds.has(c.id) && "bg-indigo-50/50"
                )}
              >
                <td className="px-3 py-2 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.has(c.id)}
                    onChange={() => onToggleSelection(c.id)}
                    aria-label={`בחר את ${c.name}`}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                  />
                </td>
                <td className="px-1 py-2 align-middle">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className={`w-7 h-7 rounded-full ${style.avatar} flex items-center justify-center text-xs font-bold shrink-0`}>
                      {c.name.slice(0, 2)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCustomerClick(c)}
                      className="text-sm font-medium text-slate-900 truncate hover:underline text-right cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                    >
                      {c.name}
                    </button>
                  </div>
                </td>
                {dateColumn && (
                  <td className="px-1 py-2 text-xs text-slate-600 align-middle">
                    {dateColumn.render(c)}
                  </td>
                )}
                <td className="px-1 py-2 text-xs text-slate-600 truncate align-middle">
                  {c.email || c.phone || "\u2014"}
                </td>
                <td className="px-1 py-2 align-middle">
                  <div className="flex items-center gap-1.5">
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
                </td>
                <td className="px-1 py-2 text-center align-middle">
                  {lastSentMap[c.id] ? (
                    <span className="text-[10px] text-slate-400">
                      {new Date(lastSentMap[c.id]).toLocaleDateString("he-IL")}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300">&mdash;</span>
                  )}
                </td>
                <td className="px-1 py-2 text-center align-middle">
                  <button
                    onClick={() => onSendToCustomer(c)}
                    disabled={sendingCustomerId === c.id || !c.phone || !c.phoneActive || (!isQuotaUnlimited && quotaRemaining <= 0)}
                    aria-label={`שלח הודעה ל-${c.name}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded ${style.sendBtn} disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                    title={!c.phone || !c.phoneActive ? "אין מספר טלפון פעיל" : `שלח ל-${c.name}`}
                  >
                    {sendingCustomerId === c.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    שלח
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selection bar */}
      {selectedCustomerIds.size > 0 && (
        <div role="status" aria-live="polite" className="flex items-center justify-between mt-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
          <span className="text-sm font-medium text-indigo-700">
            {selectedCustomerIds.size} נבחרו
          </span>
          <div className="flex items-center gap-2">
            {onBulkDelete && (
              <Button
                size="sm"
                variant="outline"
                onClick={onBulkDelete}
                disabled={isDeletingBulk}
                className="text-xs h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                {isDeletingBulk ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                מחק ({selectedCustomerIds.size})
              </Button>
            )}
            {onBulkSend && (
              <Button
                size="sm"
                onClick={onBulkSend}
                className="text-xs h-7 gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Send className="w-3 h-3" />
                שלח לנבחרים ({selectedCustomerIds.size})
              </Button>
            )}
          </div>
        </div>
      )}

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
