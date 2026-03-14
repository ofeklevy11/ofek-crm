import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import PaymentsTable from "@/components/finance/PaymentsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "תשלומים" };

export default async function PaymentsPage({
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

  const companyFilter = { companyId: user.companyId, deletedAt: null };

  const [totalPayments, payments, statusCounts, outstandingAgg] = await Promise.all([
    prisma.oneTimePayment.count({ where: companyFilter }),
    prisma.oneTimePayment.findMany({
      where: companyFilter,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.oneTimePayment.groupBy({
      by: ["status"],
      where: companyFilter,
      _count: { id: true },
    }),
    prisma.oneTimePayment.aggregate({
      where: { ...companyFilter, status: { in: ["pending", "overdue"] } },
      _sum: { amount: true },
    }),
  ]);
  const totalPages = Math.ceil(totalPayments / pageSize);

  const statusMap = new Map(statusCounts.map((s) => [s.status, s._count.id]));
  const pendingCount = statusMap.get("pending") ?? 0;
  const paidCount = statusMap.get("paid") ?? 0;
  const overdueCount = statusMap.get("overdue") ?? 0;
  const totalOutstanding = Number(outstandingAgg._sum.amount ?? 0);

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
              תשלומים חד פעמיים
            </h1>
            <p className="text-gray-500 mt-1">
              ניהול כל דרישות התשלום החד פעמיות
            </p>
          </div>
          <Link
            href="/finance/payments/new"
            prefetch={false}
            className="inline-flex items-center px-4 py-2 bg-[#4f95ff] text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          >
            + תשלום חדש
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p id="stat-pending" className="text-sm text-gray-500">ממתין</p>
          <p aria-labelledby="stat-pending" className="text-3xl font-bold text-gray-700 mt-2">
            {pendingCount}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p id="stat-overdue" className="text-sm text-gray-500">באיחור</p>
          <p aria-labelledby="stat-overdue" className="text-3xl font-bold text-[#a24ec1] mt-2">
            {overdueCount}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p id="stat-paid" className="text-sm text-gray-500">שולם</p>
          <p aria-labelledby="stat-paid" className="text-3xl font-bold text-[#4f95ff] mt-2">
            {paidCount}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p id="stat-total-outstanding" className="text-sm text-gray-500">סה"כ לתשלום</p>
          <p aria-labelledby="stat-total-outstanding" className="text-2xl font-bold text-gray-900 mt-2">
            ₪{totalOutstanding.toLocaleString()}
          </p>
        </div>
      </div>

      <PaymentsTable payments={payments} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
