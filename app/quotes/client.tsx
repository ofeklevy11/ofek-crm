"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  RotateCcw,
  Eye,
  Edit,
  Archive,
  Settings,
  X,
  Loader2,
} from "lucide-react";
import { trashQuote, restoreQuote, getQuotes } from "@/app/actions/quotes";
import { BusinessSettings } from "@/app/actions/business-settings";
import { useRouter } from "next/navigation";
import BusinessSettingsRequired from "./business-settings-required";
import { showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { getUserFriendlyError } from "@/lib/errors";

const formatMoney = (amount: number, currency: string = "ILS") => {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
  }).format(amount);
};

interface QuoteSummary {
  id: string;
  quoteNumber: number | null;
  clientName: string;
  clientEmail: string | null;
  total: number;
  currency: string;
  status: string;
  createdAt: Date;
  validUntil: Date | null;
  _count: { items: number };
}

interface Props {
  initialQuotes: QuoteSummary[];
  initialNextCursor: string | null;
  showTrashed: boolean;
  businessSettings: BusinessSettings | null;
}

export default function QuotesPageClient({ initialQuotes, initialNextCursor, showTrashed, businessSettings }: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteSummary[]>(initialQuotes);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isLoadingMore, startLoadMore] = useTransition();

  const handleTrash = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await showConfirm("האם להעביר הצעת מחיר זו לפח?")) {
      setLoadingId(id);
      try {
        await trashQuote(id);
        toast.success("ההצעה הועברה לפח");
        setQuotes((prev) => prev.filter((q) => q.id !== id));
      } catch (error) {
        if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
        else toast.error(getUserFriendlyError(error));
      } finally {
        setLoadingId(null);
      }
    }
  };

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingId(id);
    try {
      await restoreQuote(id);
      toast.success("ההצעה שוחזרה בהצלחה");
      setQuotes((prev) => prev.filter((q) => q.id !== id));
    } catch (error) {
      if (isRateLimitError(error)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(error));
    } finally {
      setLoadingId(null);
    }
  };

  const handleLoadMore = () => {
    if (!nextCursor || isLoadingMore) return;
    startLoadMore(async () => {
      try {
        const { quotes: moreQuotes, nextCursor: newCursor } = await getQuotes(showTrashed, nextCursor);
        setQuotes((prev) => [...prev, ...moreQuotes as QuoteSummary[]]);
        setNextCursor(newCursor);
      } catch (err: any) {
        if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
        else toast.error(getUserFriendlyError(err));
      }
    });
  };

  const filteredQuotes = quotes.filter(
    (q) =>
      q.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (q.quoteNumber && String(q.quoteNumber).includes(search)) ||
      (q.id && q.id.includes(search))
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <Clock className="w-3 h-3 ml-1" /> טיוטה
          </span>
        );
      case "SENT":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <FileText className="w-3 h-3 ml-1" /> נשלחה
          </span>
        );
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3 ml-1" /> אושרה
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3 ml-1" /> נדחתה
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  const formatQuoteNumber = (quote: QuoteSummary) => {
    if (quote.quoteNumber) {
      return `#${String(quote.quoteNumber).padStart(5, "0")}`;
    }
    return `#${quote.id.slice(-6).toUpperCase()}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {showTrashed ? "פח זבל - הצעות מחיר" : "הצעות מחיר"}
          </h1>
          <p className="text-gray-500 mt-1">
            {showTrashed
              ? "הצעות מחיר שהועברו לפח זבל. הצעות אלה נשמרות לצמיתות."
              : "ניהול ומעקב אחר הצעות המחיר שלך."}
          </p>
        </div>
        <div className="flex gap-2">
          {showTrashed ? (
            <a href="/quotes">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors">
                <RotateCcw className="w-4 h-4" /> חזרה להצעות
              </button>
            </a>
          ) : (
            <>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors"
              >
                <Settings className="w-4 h-4" /> הגדרות עסק
              </button>
              <a href="/quotes?trash=true">
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors">
                  <Archive className="w-4 h-4" /> פח זבל
                </button>
              </a>
              <a href="/quotes/new">
                <button className="flex items-center gap-2 px-4 py-2 bg-[#4f95ff] text-white rounded-md hover:bg-[#3d7de0] font-medium transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> הצעת מחיר חדשה
                </button>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4 items-center">
        <div className="relative max-w-md w-full">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            placeholder="חיפוש לפי שם לקוח או מספר הצעה..."
            className="w-full pr-9 pl-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#4f95ff] outline-none bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-gray-500">
          {filteredQuotes.length} הצעות מחיר
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                מספר הצעה
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                לקוח
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                סכום
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                סטטוס
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                תאריך יצירה
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                בתוקף עד
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                פעולות
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredQuotes.map((quote) => (
              <tr
                key={quote.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => router.push(`/quotes/${quote.id}`)}
              >
                <td className="px-6 py-4">
                  <span className="font-mono font-medium text-gray-900">
                    {formatQuoteNumber(quote)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {quote.clientName}
                    </p>
                    {quote.clientEmail && (
                      <p className="text-sm text-gray-500">
                        {quote.clientEmail}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-gray-900">
                    {formatMoney(Number(quote.total), quote.currency || "ILS")}
                  </span>
                  <p className="text-xs text-gray-500">
                    {quote._count?.items || 0} פריטים
                  </p>
                </td>
                <td className="px-6 py-4">{getStatusBadge(quote.status)}</td>
                <td className="px-6 py-4 text-gray-600">
                  {new Date(quote.createdAt).toLocaleDateString("he-IL")}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {quote.validUntil
                    ? new Date(quote.validUntil).toLocaleDateString("he-IL")
                    : "-"}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/quotes/${quote.id}`);
                      }}
                      className="p-2 text-gray-500 hover:text-[#4f95ff] hover:bg-blue-50 rounded-md transition-colors"
                      title="עריכה"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/quotes/${quote.id}/pdf`, "_blank");
                      }}
                      className="p-2 text-gray-500 hover:text-[#4f95ff] hover:bg-blue-50 rounded-md transition-colors"
                      title="תצוגה מקדימה"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {showTrashed ? (
                      <button
                        onClick={(e) => handleRestore(quote.id, e)}
                        disabled={loadingId === quote.id}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors disabled:opacity-50"
                        title="שחזור"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleTrash(quote.id, e)}
                        disabled={loadingId === quote.id}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        title="העבר לפח"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Load More */}
        {nextCursor && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> טוען...
                </>
              ) : (
                "טען עוד הצעות"
              )}
            </button>
          </div>
        )}

        {/* Empty State */}
        {filteredQuotes.length === 0 && (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              {showTrashed ? (
                <Archive className="w-8 h-8 text-gray-400" />
              ) : (
                <FileText className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {showTrashed ? "פח הזבל ריק" : "אין הצעות מחיר"}
            </h3>
            <p className="text-gray-500 mb-4">
              {showTrashed
                ? "לא הועברו הצעות מחיר לפח הזבל."
                : "צור את הצעת המחיר הראשונה שלך כדי להתחיל."}
            </p>
            {!showTrashed && (
              <a href="/quotes/new">
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#4f95ff] text-white rounded-md hover:bg-[#3d7de0] font-medium transition-colors">
                  <Plus className="w-4 h-4" /> הצעת מחיר חדשה
                </button>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Business Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSettingsModal(false)}
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 left-4 z-20 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-sm"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
            <BusinessSettingsRequired
              initialSettings={businessSettings}
              onSaved={() => {
                setShowSettingsModal(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
