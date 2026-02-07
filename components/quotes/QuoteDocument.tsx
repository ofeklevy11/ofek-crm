import React from "react";
import { Quote, Company, QuoteItem, Product, Client } from "@prisma/client";

type CompanyWithSettings = Company & {
  businessType?: string | null;
  taxId?: string | null;
  businessAddress?: string | null;
  businessWebsite?: string | null;
  businessEmail?: string | null;
  logoUrl?: string | null;
};

type FullQuote = Quote & {
  company: CompanyWithSettings;
  client: Client | null;
  items: (QuoteItem & {
    product: Product | null;
  })[];
  quoteNumber?: number | null;
};

interface QuoteDocumentProps {
  quote: FullQuote;
}

const getBusinessTypeLabel = (type: string | null | undefined): string => {
  switch (type) {
    case "exempt":
      return "עוסק פטור";
    case "licensed":
      return "עוסק מורשה";
    case "ltd":
      return "חברה בע״מ";
    default:
      return "";
  }
};

const isVatExempt = (type: string | null | undefined): boolean => {
  return type === "exempt";
};

export default function QuoteDocument({ quote }: QuoteDocumentProps) {
  const businessTypeLabel = getBusinessTypeLabel(quote.company.businessType);
  const vatExempt = isVatExempt(quote.company.businessType);
  const vatRate = 0.18;

  const total = Number(quote.total);
  const isIncludeVat = (quote as any).isPriceWithVat;
  let subtotal = total;
  let vat = 0;
  let finalTotal = total;

  if (!vatExempt) {
    if (isIncludeVat) {
      subtotal = total / (1 + vatRate);
      vat = total - subtotal;
      finalTotal = total;
    } else {
      vat = total * vatRate;
      finalTotal = total + vat;
    }
  }

  const quoteNumber = quote.quoteNumber
    ? String(quote.quoteNumber).padStart(5, "0")
    : quote.id.slice(-6).toUpperCase();

  // Collect all descriptions for the full-width section
  const hasDescriptions = quote.items.some((item) => item.description);

  return (
    <div
      className="max-w-[210mm] mx-auto bg-white p-8 md:p-12 text-sm text-right"
      dir="rtl"
    >
      {/* Header - minimal */}
      <div className="flex justify-between items-start pb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הצעת מחיר</h1>
          <p className="text-gray-600 text-xs mt-1 font-mono">#{quoteNumber}</p>
        </div>
        <div className="text-left flex items-center gap-3">
          {quote.company.logoUrl && (
            <img
              src={quote.company.logoUrl}
              alt="לוגו"
              className="w-12 h-12 object-contain"
            />
          )}
          <div>
            <p className="font-semibold text-gray-900">{quote.company.name}</p>
            {businessTypeLabel && quote.company.taxId && (
              <p className="text-gray-600 text-xs">
                {businessTypeLabel} | {quote.company.taxId}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Title if exists */}
      {(quote as any).title && (
        <div className="pb-4">
          <p className="text-lg font-semibold text-gray-700">
            {(quote as any).title}
          </p>
        </div>
      )}

      {/* Thin separator */}
      <div className="border-t border-gray-200 mb-6" />

      {/* Totals Section - BEFORE items */}
      <div className="mb-8 flex justify-between items-end">
        <div className="text-gray-600 text-xs space-y-1">
          <p>
            תאריך: {new Date(quote.createdAt).toLocaleDateString("he-IL")}
          </p>
          {quote.validUntil && (
            <p>
              בתוקף עד: {new Date(quote.validUntil).toLocaleDateString("he-IL")}
            </p>
          )}
        </div>
        <div className="text-left space-y-1">
          {!vatExempt && (
            <>
              <div className="flex justify-between gap-8 text-xs text-gray-600">
                <span>
                  סיכום{isIncludeVat ? " (לפני מע״מ)" : ""}
                </span>
                <span className="font-mono">
                  ₪{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between gap-8 text-xs text-gray-600">
                <span>מע״מ (18%)</span>
                <span className="font-mono">
                  ₪{vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
          {vatExempt && (
            <div className="flex justify-between gap-8 text-xs text-gray-600">
              <span>פטור ממע״מ</span>
            </div>
          )}
          <div className="flex justify-between gap-8 text-lg font-bold text-gray-900 border-t border-gray-200 pt-1">
            <span>סה״כ</span>
            <span className="font-mono">
              ₪{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Client & Company Info - compact */}
      <div className="grid grid-cols-2 gap-8 mb-6 text-xs">
        <div>
          <p className="text-gray-600 mb-1">עבור</p>
          <p className="font-semibold text-gray-900">{quote.clientName}</p>
          {quote.clientTaxId && (
            <p className="text-gray-700">ח.פ / ת.ז: {quote.clientTaxId}</p>
          )}
          {quote.clientEmail && <p className="text-gray-700">{quote.clientEmail}</p>}
          {quote.clientPhone && <p className="text-gray-700">{quote.clientPhone}</p>}
          {quote.clientAddress && (
            <p className="text-gray-600 mt-1">{quote.clientAddress}</p>
          )}
        </div>
        <div>
          <p className="text-gray-600 mb-1">מאת</p>
          <p className="font-semibold text-gray-900">{quote.company.name}</p>
          {businessTypeLabel && (
            <p className="text-gray-700">{businessTypeLabel}</p>
          )}
          {quote.company.taxId && (
            <p className="text-gray-700">
              {quote.company.businessType === "ltd" ? "ח.פ" : "מספר עוסק"}:{" "}
              {quote.company.taxId}
            </p>
          )}
          {quote.company.businessAddress && (
            <p className="text-gray-600">{quote.company.businessAddress}</p>
          )}
          {quote.company.businessEmail && (
            <p className="text-gray-700">{quote.company.businessEmail}</p>
          )}
        </div>
      </div>

      {/* Items Table - clean minimal, no description in table */}
      <div>
        <table className="w-full text-right">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-600">
              <th className="py-2 px-2 font-medium w-[5%]">#</th>
              <th className="py-2 px-2 font-medium w-[45%]">תיאור</th>
              <th className="py-2 px-2 font-medium text-center w-[12%]">כמות</th>
              <th className="py-2 px-2 font-medium text-left w-[18%]">מחיר יחידה</th>
              <th className="py-2 px-2 font-medium text-left w-[20%]">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-3 px-2 text-gray-600 text-xs align-top">
                  {i + 1}
                </td>
                <td className="py-3 px-2 align-top">
                  <p className="font-medium text-gray-900 text-sm">
                    {item.product?.name || "פריט כללי"}
                  </p>
                  {(item.description || item.product?.description) && (
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">
                      {item.description || item.product?.description}
                    </p>
                  )}
                </td>
                <td className="py-3 px-2 text-center align-top text-sm font-mono text-gray-800">
                  {item.quantity}
                </td>
                <td className="py-3 px-2 text-left align-top text-sm font-mono text-gray-800">
                  ₪{Number(item.unitPrice).toLocaleString()}
                </td>
                <td className="py-3 px-2 text-left align-top text-sm font-mono font-medium text-gray-900">
                  ₪{(Number(item.quantity) * Number(item.unitPrice)).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Descriptions - full width section */}
      {hasDescriptions && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b border-gray-200 pb-2">
            הערות נוספות
          </h3>
          <div className="space-y-4">
            {quote.items.map((item, i) =>
              item.description ? (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-800 mb-1">
                    {item.product?.name || "פריט כללי"}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-12 pb-4 text-center text-xs text-gray-600">
        <p>
          מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס. ההצעה בתוקף עד{" "}
          {quote.validUntil
            ? new Date(quote.validUntil).toLocaleDateString("he-IL")
            : "30 יום מיום הפקתה"}
          .
        </p>
        {(quote.company.businessWebsite || quote.company.businessEmail) && (
          <p className="mt-2">
            {[quote.company.businessWebsite, quote.company.businessEmail]
              .filter(Boolean)
              .join(" | ")}
          </p>
        )}
      </div>
    </div>
  );
}
