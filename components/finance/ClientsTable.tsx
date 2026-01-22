"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Trash2, Eye, Mail, Phone, Building } from "lucide-react";
import { useRouter } from "next/navigation";

interface ClientsTableProps {
  clients: any[];
}

export default function ClientsTable({ clients }: ClientsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "האם אתה בטוח שברצונך למחוק לקוח זה? פעולה זו תמחק גם את הריטיינרים והתשלומים המקושרים. לא ניתן לבטל פעולה זו.",
      )
    )
      return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/finance/clients/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete client");

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete client");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-[#f4f8f8]">
          <tr>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              שם
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              פרטי קשר
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              ריטיינרים פעילים
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              חוב פתוח
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              פעולות
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {clients.map((client) => {
            const oneTimeDebt = client.oneTimePayments.reduce(
              (sum: number, payment: any) => sum + Number(payment.amount),
              0,
            );

            const retainerDebt = client.retainers.reduce(
              (sum: number, retainer: any) => {
                const nextDueDate = retainer.nextDueDate
                  ? new Date(retainer.nextDueDate)
                  : null;
                const isOverdue = nextDueDate && nextDueDate < new Date();

                if (isOverdue) {
                  return sum + Number(retainer.amount);
                }
                return sum;
              },
              0,
            );

            const outstanding = oneTimeDebt + retainerDebt;

            return (
              <tr
                key={client.id}
                className="hover:bg-gray-50 transition-colors group"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {client.name}
                  </div>
                  {client.company && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Building className="w-3 h-3" />
                      {client.company}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {client.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {client.email}
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1 mt-1">
                      <Phone className="w-3 h-3" />
                      {client.phone}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#4f95ff]/10 text-[#4f95ff]">
                    {client.retainers.length}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium text-center">
                  {outstanding > 0 ? (
                    <span className="text-[#a24ec1]">
                      ₪{outstanding.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-gray-400">₪0</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href={`/finance/clients/${client.id}`}
                      prefetch={false}
                      className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                      title="צפה בלקוח"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/finance/clients/${client.id}/edit`}
                      prefetch={false}
                      className="p-2 text-gray-600 hover:text-[#4f95ff] hover:bg-blue-50 rounded-lg transition-all"
                      title="ערוך לקוח"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(client.id)}
                      disabled={deletingId === client.id}
                      className="p-2 text-gray-600 hover:text-[#a24ec1] hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50"
                      title="מחק לקוח"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {clients.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                לא נמצאו לקוחות. התחל בהוספת הלקוח הראשון שלך.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
