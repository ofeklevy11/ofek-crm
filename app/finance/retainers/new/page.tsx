import CreateRetainerForm from "@/components/finance/CreateRetainerForm";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function NewRetainerPage() {
  return (
    <div className="max-w-2xl mx-auto p-8" dir="rtl">
      <div className="mb-8">
        <Link
          href="/finance/retainers"
          prefetch={false}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה לריטיינרים
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">יצירת ריטיינר חדש</h1>
        <p className="text-gray-500 mt-1">הגדרת הסכם חיוב חוזר.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <CreateRetainerForm />
      </div>
    </div>
  );
}
