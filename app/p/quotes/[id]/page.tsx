import { prisma } from "@/lib/prisma";
import { Download, FileText } from "lucide-react";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `הצעת מחיר / חשבונית`,
  };
}

export default async function PublicQuoteDownloadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  console.log("Public  Quote Page: starting render");
  const resolvedParams = await params;
  console.log("Public Quote Page: params resolved", resolvedParams);

  const quote = await prisma.quote.findUnique({
    where: { id: resolvedParams.id },
  });
  console.log("Public Quote Page: quote fetched", quote ? "found" : "null");

  if (!quote) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[#f4f8f8] text-gray-500 font-sans"
        dir="rtl"
      >
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">שגיאה</h2>
          <p>המסמך לא נמצא או שהקישור אינו תקין.</p>
        </div>
      </div>
    );
  }

  const quoteNumber = quote.quoteNumber
    ? String(quote.quoteNumber).padStart(5, "0")
    : quote.id.slice(-6).toUpperCase();

  return (
    <div
      className="min-h-screen bg-[#f4f8f8] flex flex-col items-center justify-center p-4 font-sans"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 transform rotate-3">
          <FileText className="w-10 h-10 text-[#4f95ff]" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            חשבונית / הצעת מחיר מס’ {quoteNumber}
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed px-4">
            מסמך זה הופק באופן דיגיטלי והוא מאושר ומאובטח.
            <br />
            להצגת והורדת המסמך המקורי, לחצו על הכפתור למטה.
          </p>
        </div>

        <div className="space-y-4 pt-2">
          <a
            href={`/api/p/quotes/${quote.id}/download`}
            className="flex items-center justify-center gap-2 w-full py-4 px-6 bg-[#4f95ff] hover:bg-[#3d7de0] text-white rounded-xl font-bold text-lg shadow-blue-200 shadow-lg transform hover:-translate-y-1 transition-all duration-200"
          >
            <Download className="w-5 h-5" />
            להורדת המסמך (PDF)
          </a>
        </div>

        <div className="pt-8 mt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium">
            מוגש באמצעות מערכת COOL CRM
          </p>
        </div>
      </div>
    </div>
  );
}
