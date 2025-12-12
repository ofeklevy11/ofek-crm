import { getQuoteById } from "@/app/actions/quotes";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import PrintButton from "./print-button";

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
      <div className="max-w-[210mm] mx-auto bg-white min-h-screen p-8 md:p-16 print:p-0">
        {/* Helper Header for Screen */}
        <div className="print:hidden mb-8 flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
          <div>
            <h2 className="font-semibold text-gray-900">Print Preview</h2>
            <p className="text-sm text-gray-500">
              Use your browser's print dialog to save as PDF.
            </p>
          </div>

          <PrintButton />
        </div>

        {/* Document Container */}
        <div className="space-y-8 text-sm md:text-base">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                Price Quote
              </h1>
              <p className="text-gray-500 mt-2">
                #{quote.id.slice(-6).toUpperCase()}
              </p>
              <p className="text-gray-500">
                Date: {new Date(quote.createdAt).toLocaleDateString("he-IL")}
              </p>
              {quote.validUntil && (
                <p className="text-gray-500">
                  Valid Until:{" "}
                  {new Date(quote.validUntil).toLocaleDateString("he-IL")}
                </p>
              )}
            </div>
            <div className="text-right">
              <h3 className="font-bold text-xl">{quote.company.name}</h3>
              <p className="text-gray-600">Authorized Dealer / Company</p>
              {/* Add company details if available in Company model or settings */}
            </div>
          </div>

          {/* Client & Company Info */}
          <div className="grid grid-cols-2 gap-12">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Prepared For:
              </h4>
              <div className="text-gray-600 space-y-1">
                <p className="font-medium text-gray-800">{quote.clientName}</p>
                {quote.clientTaxId && <p>Tax ID / H.P: {quote.clientTaxId}</p>}
                {quote.clientEmail && <p>{quote.clientEmail}</p>}
                {quote.clientPhone && <p>{quote.clientPhone}</p>}
                {quote.clientAddress && (
                  <p className="whitespace-pre-wrap">{quote.clientAddress}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <h4 className="font-semibold text-gray-900 mb-2">From:</h4>
              <div className="text-gray-600 space-y-1">
                <p className="font-medium text-gray-800">
                  {quote.company.name}
                </p>
                <p>contact@company.com</p> {/* Placeholder */}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mt-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="py-3 font-semibold text-gray-900">
                    Description
                  </th>
                  <th className="py-3 font-semibold text-gray-900 text-center">
                    Quantity
                  </th>
                  <th className="py-3 font-semibold text-gray-900 text-right">
                    Unit Price
                  </th>
                  <th className="py-3 font-semibold text-gray-900 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quote.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-4">
                      <p className="font-medium text-gray-900">
                        {item.product?.name || "Item"}
                      </p>
                      <p className="text-gray-500 text-sm mt-0.5 whitespace-pre-wrap">
                        {item.description}
                      </p>
                    </td>
                    <td className="py-4 text-center">{item.quantity}</td>
                    <td className="py-4 text-right">
                      ₪{Number(item.unitPrice).toFixed(2)}
                    </td>
                    <td className="py-4 text-right font-medium">
                      ₪
                      {(Number(item.quantity) * Number(item.unitPrice)).toFixed(
                        2
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end pt-8 border-t">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>₪{Number(quote.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax (17%)</span>
                <span>₪{(Number(quote.total) * 0.17).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>₪{(Number(quote.total) * 1.17).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer / Notes */}
          <div className="pt-12 text-sm text-gray-500 text-center">
            <p>Thank you for your business!</p>
            <p className="mt-1">
              This quote is valid until{" "}
              {quote.validUntil
                ? new Date(quote.validUntil).toLocaleDateString()
                : "30 days from issue"}
              .
            </p>
          </div>
        </div>
      </div>

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
