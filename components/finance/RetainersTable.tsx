"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Trash2, Eye, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, throwResponseError } from "@/lib/api-fetch";
import EditRetainerModal from "./EditRetainerModal";
import RetainerPaymentModal from "./RetainerPaymentModal";
import { showDestructiveConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";

interface RetainersTableProps {
  retainers: any[];
}

export default function RetainersTable({ retainers }: RetainersTableProps) {
  const router = useRouter();
  const [selectedRetainer, setSelectedRetainer] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const handleDelete = async (id: string) => {
    if (
      !(await showDestructiveConfirm({
        title: "מחיקת ריטיינר",
        message: "האם אתה בטוח שברצונך למחוק ריטיינר זה? לא ניתן לבטל.",
        confirmationPhrase: "מחק",
      }))
    )
      return;

    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/finance/retainers/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) await throwResponseError(response, "Failed to delete retainer");

      toast.success("הריטיינר נמחק בהצלחה");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(getUserFriendlyError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#4f95ff]/10 text-[#4f95ff]";
      case "paused":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-[#a24ec1]/10 text-[#a24ec1]";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case "monthly":
        return "חודשי";
      case "quarterly":
        return "רבעוני";
      case "annually":
        return "שנתי";
      default:
        return freq;
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <caption className="sr-only">רשימת ריטיינרים</caption>
            <thead className="bg-[#f4f8f8]">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  לקוח
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  כותרת
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  סכום
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  תדירות
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  תשלום הבא
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  סטטוס
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {retainers.map((retainer) => (
                <tr
                  key={retainer.id}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/finance/clients/${retainer.clientId}`}
                      prefetch={false}
                      className="text-sm font-medium text-[#4f95ff] hover:text-blue-900 hover:underline"
                    >
                      {retainer.client.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {retainer.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                    ₪{Number(retainer.amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {getFrequencyLabel(retainer.frequency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {retainer.nextDueDate ? (
                      <div className="flex items-center gap-1 justify-start">
                        <Calendar className="w-3 h-3" />
                        {new Date(retainer.nextDueDate).toLocaleDateString(
                          "he-IL",
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        retainer.status,
                      )}`}
                    >
                      {retainer.status === "active"
                        ? "פעיל"
                        : retainer.status === "paused"
                          ? "מושהה"
                          : retainer.status === "cancelled"
                            ? "לא פעיל"
                            : retainer.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(() => {
                        if (!retainer.nextDueDate) return null;
                        const nextDue = new Date(retainer.nextDueDate);
                        const now = new Date();

                        // Calculate overdue count
                        let overdueCount = 0;
                        if (nextDue <= now) {
                          let current = new Date(nextDue);
                          // Limit to 50 to prevent infinite loops on bad data
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
                          <div className="flex flex-col items-end gap-1">
                            {overdueCount > 0 ? (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100 whitespace-nowrap">
                                ממתין לתשלום: {overdueCount}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100 whitespace-nowrap">
                                שולם
                              </span>
                            )}
                            <button
                              onClick={() =>
                                handlePaymentClick(
                                  retainer,
                                  Math.max(1, overdueCount),
                                )
                              }
                              className="bg-[#4f95ff] text-white hover:bg-blue-600 px-2 py-1 rounded-md text-xs font-medium shadow-sm transition-all whitespace-nowrap min-w-[100px]"
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

                      <Link
                        href={`/finance/clients/${retainer.clientId}`}
                        prefetch={false}
                        className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                        title="צפה בלקוח"
                        aria-label="צפה בלקוח"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleEdit(retainer)}
                        className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                        title="ערוך ריטיינר"
                        aria-label="ערוך ריטיינר"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(retainer.id)}
                        disabled={deletingId === retainer.id}
                        className="p-2 text-gray-600 hover:text-[#a24ec1] hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50"
                        title="מחק ריטיינר"
                        aria-label="מחק ריטיינר"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {retainers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    לא נמצאו ריטיינרים. צור את הריטיינר הראשון שלך.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
