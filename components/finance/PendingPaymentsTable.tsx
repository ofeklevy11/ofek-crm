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
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payments.map((payment) => (
              <tr key={payment.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {payment.client.name}
                  </div>
                  <div className="text-xs text-gray-500">{payment.title}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900">
                    ₪{Number(payment.amount).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div
                    className={`text-sm ${
                      payment.status === "overdue"
                        ? "text-red-600 font-medium"
                        : "text-gray-500"
                    }`}
                  >
                    {new Date(payment.dueDate).toLocaleDateString("he-IL")}
                  </div>
                  {payment.status === "overdue" && (
                    <span className="text-xs text-red-500">Overdue</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => handleEdit(payment)}
                      className="text-gray-600 hover:text-blue-600 flex items-center gap-1 transition-colors bg-gray-100 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-medium"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                    <Link
                      href={`/finance/clients/${payment.clientId}`}
                      className="text-blue-600 hover:text-blue-900 text-xs font-medium hover:underline"
                    >
                      Manage
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No pending payments found.
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
