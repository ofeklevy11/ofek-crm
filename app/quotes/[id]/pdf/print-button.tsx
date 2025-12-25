"use client";

import { Printer, Download, Share2, Mail, Loader2 } from "lucide-react";
import { useState } from "react";

interface PrintButtonProps {
  quoteId: string;
}

export default function PrintButton({ quoteId }: PrintButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quote-${quoteId.slice(-6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error(error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 font-medium transition-colors"
        onClick={() => window.print()}
      >
        <Printer className="w-4 h-4" /> Print
      </button>
      <button
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
        onClick={handleDownloadPdf}
        disabled={downloading}
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? "Generating..." : "Download PDF"}
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="Coming Soon (Needs Email/Whatsapp Integration)"
      >
        <Share2 className="w-4 h-4" /> WhatsApp
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="Coming Soon (Needs Email Service)"
      >
        <Mail className="w-4 h-4" /> Email
      </button>
    </div>
  );
}
