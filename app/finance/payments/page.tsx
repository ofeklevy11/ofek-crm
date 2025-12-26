import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
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
    <div className="p-8 space-y-8 bg-[#f4f8f8] min-h-screen" dir="rtl">
      <div>
        <Link
          href="/finance"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה למרכז הפיננסי
        </Link>
        <div className="flex justify-between items-start">
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
            className="inline-flex items-center px-4 py-2 bg-[#4f95ff] text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          >
            + תשלום חדש
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">ממתין</div>
          <div className="text-3xl font-bold text-gray-700 mt-2">
            {pendingPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">באיחור</div>
          <div className="text-3xl font-bold text-[#a24ec1] mt-2">
            {overduePayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">שולם</div>
          <div className="text-3xl font-bold text-[#4f95ff] mt-2">
            {paidPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">סה"כ לתשלום</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            ₪{totalOutstanding.toLocaleString()}
          </div>
        </div>
      </div>

      <PaymentsTable payments={payments} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
