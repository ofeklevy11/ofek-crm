import { prisma } from "@/lib/prisma";
import { ArrowLeft, Calendar, DollarSign } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";

export default async function RetainersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  const totalRetainers = await prisma.retainer.count();
  const totalPages = Math.ceil(totalRetainers / pageSize);

  const retainers = await prisma.retainer.findMany({
    include: {
      client: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  const activeRetainers = retainers.filter((r) => r.status === "active");
  const pausedRetainers = retainers.filter((r) => r.status === "paused");
  const cancelledRetainers = retainers.filter((r) => r.status === "cancelled");

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
    <div className="p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div>
        <Link
          href="/finance"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Financial Hub
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              All Retainers
            </h1>
            <p className="text-gray-500 mt-1">
              Manage recurring billing agreements
            </p>
          </div>
          <Link
            href="/finance/retainers/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Retainer
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Active Retainers</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {activeRetainers.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Paused Retainers</div>
          <div className="text-3xl font-bold text-yellow-600 mt-2">
            {pausedRetainers.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Cancelled Retainers</div>
          <div className="text-3xl font-bold text-red-600 mt-2">
            {cancelledRetainers.length}
          </div>
        </div>
      </div>

      {/* Retainers Table */}
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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {retainers.map((retainer) => (
              <tr
                key={retainer.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/finance/clients/${retainer.clientId}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-900"
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
              </tr>
            ))}
            {retainers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No retainers found. Create your first retainer to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination totalPages={totalPages} />
    </div>
  );
}
