"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface Transaction {
  id: number;
  client: {
    id: number;
    name: string;
  };
  relatedType: string;
  title: string;
  amount: number;
  dueDate?: string;
  status: string;
  paidDate?: string | null;
}

interface TransactionsTableProps {
  transactions: Transaction[];
}

export default function TransactionsTable({
  transactions,
}: TransactionsTableProps) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredTransactions = transactions.filter((t) => {
    if (filterStatus === "all") return true;
    return t.status === filterStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
      case "manual-marked-paid":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#4f95ff]/10 text-[#4f95ff]">
            <CheckCircle className="w-3 h-3 ml-1" /> שולם
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Clock className="w-3 h-3 ml-1" /> ממתין
          </span>
        );
      case "overdue":
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#a24ec1]/10 text-[#a24ec1]">
            <AlertCircle className="w-3 h-3 ml-1" /> באיחור
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
      dir="rtl"
    >
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-[#f4f8f8]">
        <h3 className="font-semibold text-gray-900">עסקאות אחרונות</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const headers = ["מזהה", "לקוח", "סוג", "סכום", "תאריך", "סטטוס"];
              const csvContent = [
                headers.join(","),
                ...filteredTransactions.map((t) =>
                  [
                    t.id,
                    `"${t.client.name}"`,
                    t.relatedType,
                    t.amount,
                    t.dueDate,
                    t.status,
                  ].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csvContent], {
                type: "text/csv;charset=utf-8;",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "transactions.csv";
              a.click();
            }}
            className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 font-medium"
          >
            ייצוא ל-CSV
          </button>
          <select
            className="text-sm border-gray-300 border rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-1.5"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="pending">ממתין</option>
            <option value="paid">שולם</option>
            <option value="overdue">באיחור</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-[#f4f8f8]">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                מזהה
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                לקוח
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                סוג
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                סכום
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                תאריך
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                סטטוס
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                פעולות
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTransactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="hover:bg-gray-50 transition-colors"
                dir="rtl"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  #{transaction.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {transaction.client.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {transaction.relatedType === "retainer"
                    ? "ריטיינר"
                    : "חד פעמי"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                  ₪{transaction.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {transaction.dueDate
                    ? new Date(transaction.dueDate).toLocaleDateString("he-IL")
                    : "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {getStatusBadge(transaction.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                  {/* Actions normally go to the left in RTL tables if 'Actions' is the last column visually on the left. 
                      Standard practice: Numbers/Text Right. Actions usually Left or Right depending on design.
                      Here header says text-left (which means visually left). */}
                  <div className="flex items-center justify-end gap-2">
                    {transaction.status === "pending" && (
                      <button className="text-[#4f95ff] hover:text-blue-800 ml-3">
                        סמן כשולם
                      </button>
                    )}
                    <button className="text-gray-400 hover:text-gray-600">
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-sm text-gray-500"
                >
                  לא נמצאו עסקאות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
