"use client";

import { useEffect, useState } from "react";
import { getAnalyticsData, deleteAnalyticsView } from "@/app/actions/analytics";
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
import Link from "next/link";
import { ArrowLeft, Plus, BarChart2, Edit3, Trash2 } from "lucide-react";
import CreateAnalyticsViewModal from "@/components/analytics/CreateAnalyticsViewModal";

export default function GraphsPage() {
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getAnalyticsData();
      if (res.success && res.data) {
        // Filter only GRAPH views
        setViews(res.data.filter((v: any) => v.type === "GRAPH"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תרשים זה?")) return;
    await deleteAnalyticsView(id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="text-pink-600" />
              תצוגת גרפים
            </h1>
            <p className="text-gray-500 mt-2">
              ויזואליזציה של הנתונים בתצורה גרפית מתקדמת.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingView(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-pink-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-pink-700 flex items-center gap-2"
            >
              <Plus size={16} />
              צור גרף חדש
            </button>
            <Link
              href="/analytics"
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              חזרה לניתוח נתונים
            </Link>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
          </div>
        ) : views.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100 flex flex-col items-center">
            <div className="bg-pink-50 p-4 rounded-full mb-4">
              <BarChart2 className="text-pink-500" size={48} />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              אין גרפים להצגה
            </h3>
            <p className="text-gray-500 max-w-sm mb-6">
              צור את הגרף הראשון שלך כדי לראות את הנתונים בצורה ויזואלית
              ומרשימה.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2 bg-pink-600 text-white rounded-full hover:bg-pink-700 transition-colors shadow-lg shadow-pink-200"
            >
              צור גרף ראשון
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {views.map((view) => (
              <div
                key={view.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-4 border-b border-gray-50 flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">
                      {view.ruleName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {view.stats?.subMetric}
                    </p>
                  </div>
                  <div className="flex gap-1 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingView(view);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-50"
                      title="ערוך גרף"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(view.viewId)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-50"
                      title="מחק גרף"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-4" dir="ltr">
                  <AnalyticsGraph
                    data={view.data}
                    type={view.config.chartType}
                    height={300}
                  />
                </div>

                <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 flex justify-between items-center text-sm">
                  <span className="text-gray-500">
                    סה״כ: <strong>{view.stats?.mainMetric}</strong>
                  </span>
                  <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                    {view.tableName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <CreateAnalyticsViewModal
          isOpen={isModalOpen}
          initialData={editingView}
          mode="graph"
          onClose={() => {
            setIsModalOpen(false);
            setEditingView(null);
          }}
          onSuccess={() => {
            setIsModalOpen(false);
            setEditingView(null);
            fetchData();
          }}
        />
      </div>
    </div>
  );
}
