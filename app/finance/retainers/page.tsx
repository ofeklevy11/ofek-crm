import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import RetainersTable from "@/components/finance/RetainersTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function RetainersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  // Fetch ALL retainers to sort correctly by status (since Prisma can't easy-sort enums in custom order)
  const allRetainers = await prisma.retainer.findMany({
    where: {
      client: { companyId: user.companyId },
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Sort: Active -> Paused -> Cancelled
  const statusOrder: Record<string, number> = {
    active: 0,
    paused: 1,
    cancelled: 2,
  };

  const sortedRetainers = allRetainers.sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.ceil(sortedRetainers.length / pageSize);
  const currentRetainers = sortedRetainers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const activeRetainers = sortedRetainers.filter((r) => r.status === "active");
  const pausedRetainers = sortedRetainers.filter((r) => r.status === "paused");
  const cancelledRetainers = sortedRetainers.filter(
    (r) => r.status === "cancelled",
  );

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#f4f8f8] min-h-screen" dir="rtl">
      <div>
        <Link
          href="/finance"
          prefetch={false}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה למרכז הפיננסי
        </Link>
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              כל הריטיינרים
            </h1>
            <p className="text-gray-500 mt-1">ניהול הסכמי חיוב חוזרים</p>
          </div>
          <Link
            href="/finance/retainers/new"
            prefetch={false}
            className="inline-flex items-center px-4 py-2 bg-[#4f95ff] text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          >
            + ריטיינר חדש
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ריטיינרים פעילים</div>
          <div className="text-3xl font-bold text-[#4f95ff] mt-2">
            {activeRetainers.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ריטיינרים מושהים</div>
          <div className="text-3xl font-bold text-gray-700 mt-2">
            {pausedRetainers.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ריטיינרים לא פעילים</div>
          <div className="text-3xl font-bold text-[#a24ec1] mt-2">
            {cancelledRetainers.length}
          </div>
        </div>
      </div>

      <RetainersTable retainers={currentRetainers} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
