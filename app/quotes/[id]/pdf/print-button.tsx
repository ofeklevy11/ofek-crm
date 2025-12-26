"use client";

import { Printer, Download, Share2, Mail, Loader2 } from "lucide-react";
import { useState } from "react";

interface PrintButtonProps {
  quoteId: string;
  quoteNumber?: number | null;
}

export default function PrintButton({
  quoteId,
  quoteNumber,
}: PrintButtonProps) {
  const [downloading, setDownloading] = useState(false);

  // Format quote number for display/filename
  const formattedNumber = quoteNumber
    ? String(quoteNumber).padStart(5, "0")
    : quoteId.slice(-6);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/download`);
      if (!response.ok) throw new Error("ההורדה נכשלה");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `הצעת-מחיר-${formattedNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error(error);
      alert("שגיאה ביצירת ה-PDF. נסה שוב.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-2" dir="rtl">
      <button
        className="flex items-center gap-2 px-4 py-2 border border-[#4f95ff] text-[#4f95ff] rounded-md hover:bg-blue-50 font-medium transition-colors"
        onClick={() => window.print()}
      >
        <Printer className="w-4 h-4" /> הדפסה
      </button>
      <button
        className="flex items-center gap-2 px-4 py-2 bg-[#4f95ff] text-white rounded-md hover:bg-[#3d7de0] font-medium transition-colors disabled:opacity-50"
        onClick={handleDownloadPdf}
        disabled={downloading}
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? "מייצר..." : "הורד PDF"}
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="בקרוב (דורש שילוב וואטסאפ)"
      >
        <Share2 className="w-4 h-4" /> וואטסאפ
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="בקרוב (דורש שירות דואר)"
      >
        <Mail className="w-4 h-4" /> דוא״ל
      </button>
    </div>
  );
}
