import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import RetainersTable from "@/components/finance/RetainersTable";

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

      <RetainersTable retainers={retainers} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
