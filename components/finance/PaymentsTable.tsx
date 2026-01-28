"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Edit2,
  Trash2,
  Eye,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import EditPaymentModal from "./EditPaymentModal";

interface PaymentsTableProps {
  payments: any[];
}

export default function PaymentsTable({ payments }: PaymentsTableProps) {
  const router = useRouter();
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (payment: any) => {
    setSelectedPayment(payment);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תשלום זה? לא ניתן לבטל פעולה זו."))
      return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/finance/payments/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete payment");

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="w-4 h-4 text-[#4f95ff]" />;
      case "overdue":
        return <XCircle className="w-4 h-4 text-[#a24ec1]" />;
      case "pending":
        return <Clock className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-[#4f95ff]/10 text-[#4f95ff]";
      case "overdue":
        return "bg-[#a24ec1]/10 text-[#a24ec1]";
      case "pending":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
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
                  תאריך יעד
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  תאריך תשלום
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
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/finance/clients/${payment.clientId}`}
                      prefetch={false}
                      className="text-sm font-medium text-[#4f95ff] hover:text-blue-900 hover:underline"
                    >
                      {payment.client.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {payment.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                    ₪{Number(payment.amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    <div className="flex items-center gap-1 justify-start">
                      {" "}
                      {/* RTL: justify-start for dates usually nice if text-right, but actually numeric/dates align right in RTL so justify-start might be wrong, justify-end? No, table cell is text-right. So content aligns right. flex defaults to row, so justify-start is Right in RTL? No, flex follows direction. In RTL, justify-start is Right. */}
                      <Calendar className="w-3 h-3" />
                      {new Date(payment.dueDate).toLocaleDateString("he-IL")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {payment.paidDate ? (
                      <div className="flex items-center gap-1 justify-start text-[#4f95ff]">
                        <Calendar className="w-3 h-3" />
                        {new Date(payment.paidDate).toLocaleDateString("he-IL")}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        payment.status,
                      )}`}
                    >
                      {getStatusIcon(payment.status)}
                      {payment.status === "paid"
                        ? "שולם"
                        : payment.status === "overdue"
                          ? "באיחור"
                          : payment.status === "pending"
                            ? "ממתין"
                            : payment.status === "cancelled"
                              ? "בוטל"
                              : payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-start gap-2">
                      <Link
                        href={`/finance/clients/${payment.clientId}`}
                        prefetch={false}
                        className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                        title="צפה בלקוח"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleEdit(payment)}
                        className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                        title="ערוך תשלום"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(payment.id)}
                        disabled={deletingId === payment.id}
                        className="p-2 text-gray-600 hover:text-[#a24ec1] hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50"
                        title="מחק תשלום"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    לא נמצאו תשלומים. צור את התשלום הראשון שלך.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EditPaymentModal
        payment={selectedPayment}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />
    </>
  );
}
