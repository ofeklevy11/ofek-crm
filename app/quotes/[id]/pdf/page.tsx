import { getQuoteById } from "@/app/actions/quotes";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import PrintButton from "./print-button";
import QuoteDocument from "@/components/quotes/QuoteDocument";
import Navbar from "@/components/Navbar";

// Force dynamic to ensure data is fresh
export const dynamic = "force-dynamic";

export default async function QuotePdfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const quote = await getQuoteById(resolvedParams.id);

  if (!quote) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px] text-gray-500"
        dir="rtl"
      >
        הצעת המחיר לא נמצאה
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto quote-print-area">
      <div className="print:hidden w-full sticky top-0 z-[60]">
        <Navbar />
      </div>

      {/* Helper Header for Screen */}
      <div
        className="max-w-[210mm] mx-auto pt-8 px-8 md:px-16 print:hidden"
        dir="rtl"
      >
        <div className="mb-6 flex justify-start">
          <a
            href="/quotes"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-gray-200 bg-white hover:bg-gray-50 h-10 px-4 py-2 text-gray-700 shadow-sm"
          >
            חזור להצעות מחיר
          </a>
        </div>
        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
          <div>
            <h2 className="font-semibold text-gray-900">תצוגה מקדימה להדפסה</h2>
            <p className="text-sm text-gray-500">
              השתמש בתפריט ההדפסה של הדפדפן או הורד כ-PDF.
            </p>
          </div>

          <PrintButton
            quoteId={quote.id}
            quoteNumber={(quote as any).quoteNumber}
            clientName={(quote as any).clientName}
            clientPhone={(quote as any).clientPhone}
          />
        </div>
      </div>

      <QuoteDocument quote={quote as any} />

      {/* Print Styles Injection */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @page {
          margin: 36mm 10mm;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          .quote-print-area, .quote-print-area * {
             visibility: visible;
          }
          .quote-print-area {
             position: static !important;
             width: 100%;
             overflow: visible;
          }
          .print\\:hidden {
             display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `,
        }}
      />
    </div>
  );
}
