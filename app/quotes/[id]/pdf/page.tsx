import { getQuoteById } from "@/app/actions/quotes";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import PrintButton from "./print-button";
import QuoteDocument from "@/components/quotes/QuoteDocument";

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
    return <div>Quote not found</div>;
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto">
      {/* Helper Header for Screen */}
      <div className="max-w-[210mm] mx-auto pt-8 px-8 md:px-16 print:hidden">
        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
          <div>
            <h2 className="font-semibold text-gray-900">Print Preview</h2>
            <p className="text-sm text-gray-500">
              Use your browser's print dialog or download PDF.
            </p>
          </div>

          <PrintButton quoteId={quote.id} />
        </div>
      </div>

      <QuoteDocument quote={quote as any} />

      {/* Print Styles Injection */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0.bg-white.z-50 * {
             visibility: visible;
          }
          .fixed.inset-0.bg-white.z-50 {
             position: absolute;
             left: 0;
             top: 0;
             width: 100%;
             height: 100%;
             z-index: 9999;
             padding: 0;
             margin: 0;
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
