"use client";

import { useState } from "react";
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { deleteQuote } from "@/app/actions/quotes";
import { useRouter } from "next/navigation";

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
  }).format(amount);
};

export default function QuotesPageClient({ quotes }: { quotes: any[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this quote?")) {
      await deleteQuote(id);
      router.refresh();
    }
  };

  const filteredQuotes = quotes.filter(
    (q) =>
      q.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (q.id && q.id.includes(search))
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Clock className="w-3 h-3 mr-1" /> Draft
          </span>
        );
      case "SENT":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <FileText className="w-3 h-3 mr-1" /> Sent
          </span>
        );
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" /> Accepted
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Quotes
          </h1>
          <p className="text-gray-500 mt-1">
            Manage and track your price proposals.
          </p>
        </div>
        <Link href="/quotes/new">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Create Quote
          </button>
        </Link>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            placeholder="Search quotes..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredQuotes.map((quote) => (
          <div
            key={quote.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer p-6"
            onClick={() => router.push(`/quotes/${quote.id}`)}
          >
            <div className="flex items-center justify-between pb-4 mb-2">
              <span className="text-sm font-medium text-gray-500">
                #{quote.id.slice(-6).toUpperCase()}
              </span>
              {getStatusBadge(quote.status)}
            </div>

            <div className="flex justify-between items-end">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatMoney(Number(quote.total))}
                </div>
                <p className="text-sm font-medium text-gray-800 mt-1">
                  {quote.clientName}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(quote.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
        {filteredQuotes.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50/50 rounded-xl border border-dashed border-gray-300">
            No quotes found. Create your first one!
          </div>
        )}
      </div>
    </div>
  );
}
