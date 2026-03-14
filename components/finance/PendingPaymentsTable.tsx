"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2 } from "lucide-react";
import EditPaymentModal from "./EditPaymentModal";

interface PendingPaymentsTableProps {
  payments: any[];
}

export default function PendingPaymentsTable({
  payments,
}: PendingPaymentsTableProps) {
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleEdit = (payment: any) => {
    setSelectedPayment(payment);
    setIsEditModalOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto flex-1">
        <table className="min-w-full divide-y divide-gray-200">
          <caption className="sr-only">תשלומים בהמתנה</caption>
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                לקוח
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                סכום
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                תאריך יעד
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                פעולות
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payments.map((payment) => (
              <tr key={payment.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {payment.client.name}
                  </div>
                  <div className="text-xs text-gray-500">{payment.title}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ₪{Number(payment.amount).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div
                    className={`text-sm ${
                      payment.status === "overdue"
                        ? "text-gray-900 font-bold"
                        : "text-gray-500"
                    }`}
                  >
                    {new Date(payment.dueDate).toLocaleDateString("he-IL")}
                  </div>
                  {payment.status === "overdue" && (
                    <>
                      <span className="sr-only">סטטוס: </span>
                      <span className="text-xs text-[#a24ec1] font-medium">
                        באיחור
                      </span>
                    </>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => handleEdit(payment)}
                      className="text-gray-600 hover:text-[#4f95ff] flex items-center gap-1 transition-colors bg-gray-100 hover:bg-[#4f95ff]/10 px-3 py-1.5 rounded-md text-xs font-medium focus-visible:ring-2 focus-visible:ring-[#4f95ff] focus-visible:ring-offset-2"
                      aria-label={`ערוך תשלום ${payment.title} - ${payment.client.name}`}
                    >
                      <Edit2 className="w-3 h-3" />
                      ערוך
                    </button>
                    <Link
                      href={`/finance/clients/${payment.clientId}`}
                      prefetch={false}
                      className="text-[#4f95ff] hover:text-[#4f95ff]/80 text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-[#4f95ff] focus-visible:ring-offset-2 rounded"
                      aria-label={`ניהול לקוח ${payment.client.name}`}
                    >
                      ניהול
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  לא נמצאו תשלומים בהמתנה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditPaymentModal
        payment={selectedPayment}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />
    </>
  );
}
