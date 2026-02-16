"use client";

import { Printer, Download, Share2, Mail, Loader2, X } from "lucide-react";
import { useState } from "react";

interface PrintButtonProps {
  quoteId: string;
  quoteNumber?: number | null;
  clientName?: string;
  clientPhone?: string | null;
  shareToken?: string | null;
}

export default function PrintButton({
  quoteId,
  quoteNumber,
  clientName = "לקוח",
  clientPhone,
  shareToken,
}: PrintButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [sendOption, setSendOption] = useState<"client" | "custom">(
    clientPhone ? "client" : "custom",
  );

  // Format quote number for display/filename
  const formattedNumber = quoteNumber
    ? String(quoteNumber).padStart(5, "0")
    : quoteId.slice(-6).toUpperCase();

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const maxAttempts = 15;
      const pollInterval = 2000; // 2 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(`/api/quotes/${quoteId}/download`);

        if (response.status === 200) {
          // PDF is ready — download it
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `הצעת-מחיר-${formattedNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          return;
        }

        if (response.status === 202 || response.status === 502) {
          // 202 = PDF generating, 502 = storage temporarily unavailable — wait and retry
          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, pollInterval));
            continue;
          }
          throw new Error("ה-PDF עדיין בהכנה, נסה שוב בעוד כמה שניות");
        }

        // Other error (401, 404, etc.)
        let errorMsg = "ההורדה נכשלה";
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          errorMsg = json.message || errorMsg;
        } catch {
          if (text) errorMsg = text;
        }
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error(error);
      alert(`שגיאה ביצירת ה-PDF: ${error.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleSendWhatsApp = () => {
    const targetPhone = sendOption === "client" ? clientPhone : phone;

    if (!targetPhone) {
      alert("נא להזין מספר טלפון");
      return;
    }

    // 1. Normalize phone
    let cleanPhone = targetPhone.replace(/\D/g, ""); // Remove non-digits
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "972" + cleanPhone.slice(1);
    }

    // 2. Prepare link
    const downloadLink = `${window.location.origin}/p/quotes/${quoteId}${shareToken ? `?token=${shareToken}` : ""}`;

    // 3. Prepare text
    const text = `שלום ${clientName}
מצורפת הצעת מחיר מאת
אופק קונקט – שיווק דיגיטלי ובניית אתרים
ממערכת CRM COOL CRM

לקבלת המסמך לחצו על הלינק הבא:
${downloadLink}`;

    // 4. Open WhatsApp
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");

    // 5. Cleanup
    setShowWhatsAppModal(false);
    setPhone("");
  };

  return (
    <>
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
          {downloading ? "מכין PDF..." : "הורד PDF"}
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 border border-green-500 text-green-600 bg-white rounded-md hover:bg-green-50 font-medium transition-colors"
          onClick={() => setShowWhatsAppModal(true)}
        >
          <Share2 className="w-4 h-4" /> וואטסאפ
        </button>
        <button
          disabled
          className="items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-400 rounded-md cursor-not-allowed hidden md:flex"
          title="בקרוב (דורש שירות דואר)"
        >
          <Mail className="w-4 h-4" /> דוא״ל
        </button>
      </div>

      {showWhatsAppModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          dir="rtl"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b pb-3 border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900">
                שליחת הצעה בוואטסאפ
              </h3>
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-4">
                {clientPhone && (
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="sendOption"
                      value="client"
                      checked={sendOption === "client"}
                      onChange={() => setSendOption("client")}
                      className="w-4 h-4 text-[#4f95ff] focus:ring-[#4f95ff]"
                    />
                    <div>
                      <span className="block font-medium text-gray-900">
                        שלח למספר של הלקוח
                      </span>
                      <span className="block text-sm text-gray-500 ltr text-right">
                        {clientPhone}
                      </span>
                    </div>
                  </label>
                )}

                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    !clientPhone ? "border-[#4f95ff] bg-blue-50/50" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="sendOption"
                    value="custom"
                    checked={sendOption === "custom"}
                    onChange={() => setSendOption("custom")}
                    className="w-4 h-4 text-[#4f95ff] focus:ring-[#4f95ff]"
                  />
                  <span className="font-medium text-gray-900">
                    הזן מספר אחר
                  </span>
                </label>

                {sendOption === "custom" && (
                  <div className="mr-7 animate-in slide-in-from-top-2 duration-200">
                    <input
                      type="tel"
                      autoFocus
                      placeholder="הכנס מספר טלפון (050...)"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f95ff] outline-none text-left bg-gray-50 focus:bg-white transition-all text-lg"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendWhatsApp();
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold transition-colors shadow-sm"
                onClick={handleSendWhatsApp}
              >
                שלח הצעת מחיר
              </button>
              <button
                className="px-6 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                onClick={() => setShowWhatsAppModal(false)}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
