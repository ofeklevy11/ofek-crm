"use client";

import { Printer, Download, Share2, Mail } from "lucide-react";

export default function PrintButton() {
  return (
    <div className="flex gap-2">
      <button
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
        onClick={() => window.print()}
      >
        <Printer className="w-4 h-4" /> Print
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="Coming Soon"
      >
        <Download className="w-4 h-4" /> PDF
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="Coming Soon"
      >
        <Share2 className="w-4 h-4" /> WhatsApp
      </button>
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed"
        title="Coming Soon"
      >
        <Mail className="w-4 h-4" /> Email
      </button>
    </div>
  );
}
