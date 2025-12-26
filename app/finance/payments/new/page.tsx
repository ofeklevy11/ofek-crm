import CreatePaymentForm from "@/components/finance/CreatePaymentForm";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function NewPaymentPage() {
  return (
    <div className="max-w-2xl mx-auto p-8" dir="rtl">
      <div className="mb-8">
        <Link
          href="/finance/payments"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה לתשלומים
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          יצירת תשלום חד פעמי
        </h1>
        <p className="text-gray-500 mt-1">רישום חיוב חד פעמי חדש ללקוח.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <CreatePaymentForm />
      </div>
    </div>
  );
}
