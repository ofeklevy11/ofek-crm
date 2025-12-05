"use client";

import { useEffect, useState } from "react";
import { getAnalyticsData } from "@/app/actions/analytics";
import { Loader2, List } from "lucide-react";
import Link from "next/link";
import AnalyticsDetailsModal from "@/components/AnalyticsDetailsModal";

export default function AnalyticsPage() {
  const [views, setViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<any | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await getAnalyticsData();
        if (res.success && res.data) {
          setViews(res.data);
        }
      } catch (error) {
        console.error("Failed to fetch analytics data", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ניתוח נתונים</h1>
            <p className="text-gray-500 mt-2">
              צפה בנתוני זמנים המחושבים על ידי האוטומציות שלך.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            חזרה לדאשבורד
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : views.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500 text-lg">
              לא נמצאו אוטומציות לחישוב זמנים.
            </div>
            <div className="text-gray-400 mt-2">
              צור אוטומציה חדשה עם פעולה "חישוב זמן בסטטוס" כדי לראות כאן
              נתונים.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {views.map((view) => (
              <div
                key={view.ruleId}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between aspect-square border border-gray-100"
              >
                <div>
                  <h3
                    className="text-lg font-semibold text-gray-900 line-clamp-2"
                    title={view.ruleName}
                  >
                    {view.ruleName}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    מקור: {view.tableName}
                  </p>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center my-4">
                  {view.data.length === 0 ? (
                    <div className="text-center">
                      <span className="text-4xl font-bold text-gray-200">
                        -
                      </span>
                      <p className="text-sm text-gray-400 mt-2">
                        אין מספיק נתונים
                      </p>
                    </div>
                  ) : !view.stats ? (
                    <div className="text-center">
                      <span className="text-4xl font-bold text-gray-200">
                        -
                      </span>
                      <p className="text-sm text-gray-400 mt-2">
                        אין מספיק נתונים
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        {view.stats.averageDuration}
                      </div>
                      <p className="text-sm text-gray-500">ממוצע זמן</p>
                      <div className="flex gap-4 mt-4 text-xs text-gray-600">
                        <div>
                          <span className="font-semibold">מינימום:</span>{" "}
                          {view.stats.minDuration}
                        </div>
                        <div>
                          <span className="font-semibold">מקסימום:</span>{" "}
                          {view.stats.maxDuration}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 flex justify-between items-center text-sm text-gray-500">
                  <span>מבוסס על:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium bg-gray-100 px-2 py-1 rounded-full">
                      {view.data.length} רשומות
                    </span>
                    {view.data.length > 0 && (
                      <button
                        onClick={() => setSelectedView(view)}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors text-blue-600"
                        title="צפה ברשימה המלאה"
                      >
                        <List size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedView && (
        <AnalyticsDetailsModal
          isOpen={!!selectedView}
          onClose={() => setSelectedView(null)}
          title={selectedView.ruleName}
          data={selectedView.data}
        />
      )}
    </div>
  );
}
