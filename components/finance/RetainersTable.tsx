"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Trash2, Eye, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import EditRetainerModal from "./EditRetainerModal";

interface RetainersTableProps {
  retainers: any[];
}

export default function RetainersTable({ retainers }: RetainersTableProps) {
  const router = useRouter();
  const [selectedRetainer, setSelectedRetainer] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (retainer: any) => {
    setSelectedRetainer(retainer);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this retainer? This action cannot be undone."
      )
    )
      return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/finance/retainers/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete retainer");

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete retainer");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Frequency
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Next Due
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
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
                    className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline"
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right capitalize">
                  {retainer.frequency}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {retainer.nextDueDate ? (
                    <div className="flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3" />
                      {new Date(retainer.nextDueDate).toLocaleDateString(
                        "he-IL"
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      retainer.status
                    )}`}
                  >
                    {retainer.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/finance/clients/${retainer.clientId}`}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="View Client"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleEdit(retainer)}
                      className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                      title="Edit Retainer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(retainer.id)}
                      disabled={deletingId === retainer.id}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                      title="Delete Retainer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {retainers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No retainers found. Create your first retainer to get started.
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
    </>
  );
}
