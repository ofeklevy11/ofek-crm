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

  // DB-level: status counts + sorted paginated IDs in parallel
  const [statusCounts, sortedIds] = await Promise.all([
    prisma.retainer.groupBy({
      by: ["status"],
      where: { companyId: user.companyId, deletedAt: null },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ id: number }[]>`
      SELECT r.id
      FROM "Retainer" r
      JOIN "Client" c ON r."clientId" = c.id
      WHERE c."companyId" = ${user.companyId}
        AND r."deletedAt" IS NULL
        AND c."deletedAt" IS NULL
      ORDER BY
        CASE r.status
          WHEN 'active' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'cancelled' THEN 2
          ELSE 99
        END,
        r."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}
    `,
  ]);

  // Fetch full retainer objects for the current page only
  const retainersById = sortedIds.length > 0
    ? await prisma.retainer.findMany({
        where: { id: { in: sortedIds.map((r) => r.id) }, deletedAt: null },
        include: { client: true },
      })
    : [];

  // Restore DB sort order
  const idOrder = new Map(sortedIds.map((r, i) => [r.id, i]));
  const currentRetainers = retainersById.sort(
    (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
  );

  // Extract counts from groupBy
  const countMap = new Map(statusCounts.map((s) => [s.status, s._count.id]));
  const activeCount = countMap.get("active") ?? 0;
  const pausedCount = countMap.get("paused") ?? 0;
  const cancelledCount = countMap.get("cancelled") ?? 0;
  const totalRetainers = activeCount + pausedCount + cancelledCount;
  const totalPages = Math.ceil(totalRetainers / pageSize);

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
            {activeCount}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ריטיינרים מושהים</div>
          <div className="text-3xl font-bold text-gray-700 mt-2">
            {pausedCount}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ריטיינרים לא פעילים</div>
          <div className="text-3xl font-bold text-[#a24ec1] mt-2">
            {cancelledCount}
          </div>
        </div>
      </div>

      <RetainersTable retainers={currentRetainers} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
