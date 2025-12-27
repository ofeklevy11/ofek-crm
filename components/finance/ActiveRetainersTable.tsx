"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2 } from "lucide-react";
import EditRetainerModal from "./EditRetainerModal";
import RetainerPaymentModal from "./RetainerPaymentModal";

interface ActiveRetainersTableProps {
  retainers: any[];
}

const getFrequencyLabel = (freq: string) => {
  switch (freq?.toLowerCase()) {
    case "monthly":
      return "חודשי";
    case "quarterly":
      return "רבעוני";
    case "annually":
    case "yearly":
      return "שנתי";
    default:
      return freq;
  }
};

export default function ActiveRetainersTable({
  retainers,
}: ActiveRetainersTableProps) {
  const [selectedRetainer, setSelectedRetainer] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<{
    retainer: any;
    count: number;
  } | null>(null);

  const handleEdit = (retainer: any) => {
    setSelectedRetainer(retainer);
    setIsEditModalOpen(true);
  };

  const handlePaymentClick = (retainer: any, overdueCount: number) => {
    setPaymentModalData({ retainer, count: overdueCount });
  };

  return (
    <>
      <div className="overflow-x-auto flex-1">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                לקוח
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                סכום
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                תאריך הבא
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                פעולות
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {retainers.map((retainer) => (
              <tr key={retainer.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {retainer.client.name}
                  </div>
                  <div className="text-xs text-gray-500">{retainer.title}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ₪{Number(retainer.amount).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {getFrequencyLabel(retainer.frequency)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {retainer.nextDueDate
                    ? new Date(retainer.nextDueDate).toLocaleDateString("he-IL")
                    : "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                  <div className="flex items-center justify-end gap-3">
                    {(() => {
                      if (!retainer.nextDueDate) return null;
                      const nextDue = new Date(retainer.nextDueDate);
                      const now = new Date();

                      // Calculate overdue count
                      let overdueCount = 0;
                      if (nextDue <= now) {
                        let current = new Date(nextDue);
                        while (current <= now && overdueCount < 50) {
                          overdueCount++;
                          switch (retainer.frequency) {
                            case "monthly":
                              current.setMonth(current.getMonth() + 1);
                              break;
                            case "quarterly":
                              current.setMonth(current.getMonth() + 3);
                              break;
                            case "annually":
                            case "yearly":
                              current.setFullYear(current.getFullYear() + 1);
                              break;
                            default:
                              current.setMonth(current.getMonth() + 1);
                          }
                        }
                      }

                      return (
                        <div className="flex flex-col items-end gap-2">
                          {overdueCount > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap">
                              ממתין לתשלום: {overdueCount}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                              שולם
                            </span>
                          )}

                          <button
                            onClick={() =>
                              handlePaymentClick(
                                retainer,
                                Math.max(1, overdueCount)
                              )
                            }
                            className="bg-[#4f95ff] text-white hover:bg-blue-600 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all whitespace-nowrap"
                            title={
                              overdueCount > 0
                                ? `סמן תשלום כשולם (${overdueCount} ממתינים)`
                                : "קבלת תשלומים קדימה"
                            }
                          >
                            {overdueCount > 0
                              ? "סמן כשולם"
                              : "קבלת תשלומים קדימה"}
                          </button>
                        </div>
                      );
                    })()}

                    <button
                      onClick={() => handleEdit(retainer)}
                      className="text-gray-600 hover:text-[#4f95ff] flex items-center gap-1 transition-colors bg-gray-100 hover:bg-[#4f95ff]/10 px-3 py-1.5 rounded-md text-xs font-medium"
                    >
                      <Edit2 className="w-3 h-3" />
                      ערוך
                    </button>
                    <Link
                      href={`/finance/clients/${retainer.clientId}`}
                      className="text-[#4f95ff] hover:text-[#4f95ff]/80 text-xs font-medium hover:underline"
                    >
                      ניהול
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {retainers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  לא נמצאו ריטיינרים פעילים.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditRetainerModal
        retainer={selectedRetainer}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />

      {paymentModalData && (
        <RetainerPaymentModal
          isOpen={!!paymentModalData}
          onClose={() => setPaymentModalData(null)}
          retainer={paymentModalData.retainer}
          overdueCount={paymentModalData.count}
        />
      )}
    </>
  );
}
