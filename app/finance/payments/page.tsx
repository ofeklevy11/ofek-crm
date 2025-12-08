import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import PaymentsTable from "@/components/finance/PaymentsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

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

  // CRITICAL: Filter by client.companyId
  const totalPayments = await prisma.oneTimePayment.count({
    where: {
      client: { companyId: user.companyId },
    },
  });
  const totalPages = Math.ceil(totalPayments / pageSize);

  // CRITICAL: Filter by client.companyId
  const payments = await prisma.oneTimePayment.findMany({
    where: {
      client: { companyId: user.companyId },
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const paidPayments = payments.filter((p) => p.status === "paid");
  const overduePayments = payments.filter((p) => p.status === "overdue");

  const totalOutstanding = payments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((sum, p) => sum + Number(p.amount), 0);

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
              One-Time Payments
            </h1>
            <p className="text-gray-500 mt-1">
              Manage all one-time payment requests
            </p>
          </div>
          <Link
            href="/finance/payments/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Payment
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-3xl font-bold text-yellow-600 mt-2">
            {pendingPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Overdue</div>
          <div className="text-3xl font-bold text-red-600 mt-2">
            {overduePayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Paid</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {paidPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Total Outstanding</div>
          <div className="text-2xl font-bold text-red-600 mt-2">
            ₪{totalOutstanding.toLocaleString()}
          </div>
        </div>
      </div>

      <PaymentsTable payments={payments} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
