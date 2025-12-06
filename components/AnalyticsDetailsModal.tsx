"use client";

import { X } from "lucide-react";

interface AnalyticsDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tableName: string;
  data: {
    id: string;
    title: string;
    status: string;
    duration: string;
    updatedAt: string;
    type: string;
    recordId: string | number;
  }[];
}

export default function AnalyticsDetailsModal({
  isOpen,
  onClose,
  title,
  tableName,
  data,
}: AnalyticsDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 line-clamp-1">
              {title}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              מקור:{" "}
              <span className="font-medium text-gray-700">{tableName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {data.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              אין נתונים להצגה
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-gray-50 text-gray-700 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium text-right rounded-tr-lg">
                      מזהה רשומה
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      שינוי סטטוס
                    </th>
                    <th className="px-4 py-3 font-medium text-right rounded-tl-lg">
                      משך זמן
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {item.recordId}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.status.split(" → ").map((part, index, arr) => {
                            const match = part.match(/^(.*)\s\((.*)\)$/);
                            const eventName = match ? match[1] : part;
                            const tableName = match ? match[2] : "";

                            return (
                              <div key={index} className="flex items-center">
                                <div className="flex flex-col items-start bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                  <span className="font-medium text-sm text-gray-800">
                                    {eventName}
                                  </span>
                                  {tableName && (
                                    <span className="text-xs text-gray-500 mt-0.5 opacity-80 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                      {tableName}
                                    </span>
                                  )}
                                </div>
                                {index < arr.length - 1 && (
                                  <span className="text-gray-400 mx-2 text-lg">
                                    →
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-blue-600 font-medium ltr text-right">
                        <span dir="ltr">{item.duration}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
