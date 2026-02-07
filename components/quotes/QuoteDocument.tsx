import React from "react";
import { Quote, Company, QuoteItem, Product, Client } from "@prisma/client";

// Extend Company type with business settings
type CompanyWithSettings = Company & {
  businessType?: string | null;
  taxId?: string | null;
  businessAddress?: string | null;
  businessWebsite?: string | null;
  businessEmail?: string | null;
};

// Define the full type including relations
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

// Helper to get business type label in Hebrew
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

// Check if business is VAT exempt
const isVatExempt = (type: string | null | undefined): boolean => {
  return type === "exempt";
};

export default function QuoteDocument({ quote }: QuoteDocumentProps) {
  const businessTypeLabel = getBusinessTypeLabel(quote.company.businessType);
  const vatExempt = isVatExempt(quote.company.businessType);
  const vatRate = 0.18;

  return (
    <div
      className="max-w-[210mm] mx-auto bg-white p-8 md:p-16 text-sm md:text-base text-right"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b border-primary/20 pb-8">
        <div>
          <h1 className="text-4xl font-bold text-primary tracking-tight">
            הצעת מחיר
          </h1>
          <p className="text-gray-500 mt-2 font-mono">
            #
            {quote.quoteNumber
              ? String(quote.quoteNumber).padStart(5, "0")
              : quote.id.slice(-6).toUpperCase()}
          </p>
          <div className="mt-4 space-y-1 text-gray-600">
            <p>
              <span className="font-semibold">תאריך הפקה:</span>{" "}
              {new Date(quote.createdAt).toLocaleDateString("he-IL")}
            </p>
            {quote.validUntil && (
              <p>
                <span className="font-semibold">בתוקף עד:</span>{" "}
                {new Date(quote.validUntil).toLocaleDateString("he-IL")}
              </p>
            )}
          </div>
        </div>
        <div className="text-left">
          <h3 className="font-bold text-xl text-gray-900">
            {quote.company.name}
          </h3>
          {businessTypeLabel && quote.company.taxId && (
            <p className="text-gray-500 text-sm">
              {businessTypeLabel} / {quote.company.taxId}
            </p>
          )}
        </div>
      </div>

      {/* Client & Company Info */}
      <div className="grid grid-cols-2 gap-12 mt-8">
        <div>
          <h4 className="font-semibold text-primary mb-3">עבור:</h4>
          <div className="text-gray-700 space-y-1 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="font-bold text-lg">{quote.clientName}</p>
            {quote.clientTaxId && (
              <p className="text-sm">ח.פ / ת.ז: {quote.clientTaxId}</p>
            )}
            {quote.clientEmail && (
              <p className="text-sm">{quote.clientEmail}</p>
            )}
            {quote.clientPhone && (
              <p className="text-sm">{quote.clientPhone}</p>
            )}
            {quote.clientAddress && (
              <p className="whitespace-pre-wrap text-sm mt-2 text-gray-500">
                {quote.clientAddress}
              </p>
            )}
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-primary mb-3">מאת:</h4>
          <div className="text-gray-700 space-y-1 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="font-bold text-lg">{quote.company.name}</p>
            {businessTypeLabel && (
              <p className="text-sm text-gray-600">{businessTypeLabel}</p>
            )}
            {quote.company.taxId && (
              <p className="text-sm">
                {quote.company.businessType === "ltd" ? "ח.פ" : "מספר עוסק"}:{" "}
                {quote.company.taxId}
              </p>
            )}
            {quote.company.businessAddress && (
              <p className="text-sm text-gray-500">
                {quote.company.businessAddress}
              </p>
            )}
            {quote.company.businessEmail && (
              <p className="text-sm">{quote.company.businessEmail}</p>
            )}
            {quote.company.businessWebsite && (
              <p className="text-sm text-primary">
                {quote.company.businessWebsite}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="mt-12">
        <table className="w-full text-right">
          <thead className="bg-primary/5 text-primary">
            <tr>
              <th className="py-3 px-4 font-semibold rounded-r-lg w-[40%]">
                תיאור
              </th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">
                כמות
              </th>
              <th className="py-3 px-4 font-semibold text-left w-[20%]">
                מחיר יחידה
              </th>
              <th className="py-3 px-4 font-semibold text-left rounded-l-lg w-[25%]">
                סה״כ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quote.items.map((item, i) => (
              <tr key={i}>
                <td className="py-4 px-4 align-top">
                  <p className="font-bold text-gray-900">
                    {item.product?.name || "פריט כללי"}
                  </p>
                  <p className="text-gray-500 text-sm mt-1 whitespace-pre-wrap leading-relaxed">
                    {item.description}
                  </p>
                </td>
                <td className="py-4 px-4 text-center align-top font-mono">
                  {item.quantity}
                </td>
                <td className="py-4 px-4 text-left align-top font-mono">
                  ₪{Number(item.unitPrice).toLocaleString()}
                </td>
                <td className="py-4 px-4 text-left align-top font-bold font-mono text-gray-900">
                  ₪
                  {(
                    Number(item.quantity) * Number(item.unitPrice)
                  ).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end pt-8 mt-8 border-t border-gray-100">
        <div className="w-72 space-y-3 bg-gray-50 p-6 rounded-xl border border-gray-100">
          {(() => {
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

            return (
              <>
                <div className="flex justify-between text-gray-600">
                  <span>
                    סיכום ביניים
                    {isIncludeVat && !vatExempt ? " (לפני מע״מ)" : ""}:
                  </span>
                  <span className="font-mono">
                    ₪
                    {subtotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {vatExempt ? (
                  <div className="flex justify-between text-gray-500 text-sm">
                    <span>פטור ממע״מ</span>
                    <span>-</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-gray-600">
                    <span>מע״מ (18%):</span>
                    <span className="font-mono">
                      ₪
                      {vat.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-3 text-xl font-bold text-primary">
                  <span>סה״כ לתשלום:</span>
                  <span className="font-mono">
                    ₪
                    {finalTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Footer / Notes */}
      <div className="pt-16 pb-8 text-center">
        <p className="text-primary font-medium">תודה שבחרתם בנו!</p>
        <p className="mt-2 text-sm text-gray-400">
          מסמך זה הינו הצעת מחיר ואינו מהווה חשבונית מס.
          <br />
          ההצעה בתוקף עד{" "}
          {quote.validUntil
            ? new Date(quote.validUntil).toLocaleDateString("he-IL")
            : "30 יום מיום הפקתה"}
          .
        </p>
        {/* Business contact info in footer */}
        {(quote.company.businessWebsite || quote.company.businessEmail) && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
            {quote.company.businessWebsite && (
              <p className="text-sm text-gray-500">
                {quote.company.businessWebsite}
              </p>
            )}
            {quote.company.businessEmail && (
              <p className="text-sm text-gray-500">
                {quote.company.businessEmail}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
