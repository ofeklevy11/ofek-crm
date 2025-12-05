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
        "Are you sure you want to delete this client? This will also delete all associated retainers and payments. This action cannot be undone."
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
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Contact
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active Retainers
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Outstanding
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {clients.map((client) => {
            const outstanding = client.oneTimePayments.reduce(
              (sum: number, payment: any) => sum + Number(payment.amount),
              0
            );

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
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {client.retainers.length}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium text-center">
                  {outstanding > 0 ? (
                    <span className="text-red-600">
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
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="View Client"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/finance/clients/${client.id}/edit`}
                      className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                      title="Edit Client"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(client.id)}
                      disabled={deletingId === client.id}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                      title="Delete Client"
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
                No clients found. Start by adding your first client.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
