import { prisma } from "@/lib/prisma";
import FinancialStats from "@/components/finance/FinancialStats";
import ActiveRetainersTable from "@/components/finance/ActiveRetainersTable";
import PendingPaymentsTable from "@/components/finance/PendingPaymentsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import {
  Plus,
  ArrowRight,
  CreditCard,
  Repeat,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch real data from database - CRITICAL: Filter by client.companyId
  const [transactions, activeRetainers, pendingPayments, stats] =
    await Promise.all([
      prisma.transaction.findMany({
        where: {
          client: { companyId: user.companyId },
        },
        include: { client: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.retainer.findMany({
        where: {
          status: "active",
          client: { companyId: user.companyId },
        },
        include: { client: true },
        orderBy: { nextDueDate: "asc" },
      }),
      prisma.oneTimePayment.findMany({
        where: {
          status: { in: ["pending", "overdue"] },
          client: { companyId: user.companyId },
        },
        include: { client: true },
        orderBy: { dueDate: "asc" },
      }),
      // Calculate stats
      prisma.client.count({
        where: { companyId: user.companyId },
      }),
    ]);

  // Calculate totals
  const totalRevenue = transactions
    .filter((t) => t.status === "manual-marked-paid")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const outstandingDebt = pendingPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  return (
    <div className="p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Financial Hub
          </h1>
          <p className="text-gray-500 mt-1">
            Overview of your business finances
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/finance/retainers/new"
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Retainer
          </Link>
          <Link
            href="/finance/payments/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Payment
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <FinancialStats
        totalRevenue={totalRevenue}
        outstandingDebt={outstandingDebt}
        activeRetainers={activeRetainers.length}
        collectionRate={98} // Placeholder for now
      />

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/finance/clients"
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Clients</h3>
          <p className="text-gray-500 text-sm mt-1">
            Manage client profiles and history
          </p>
        </Link>
        <Link
          href="/finance/retainers"
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <Repeat className="w-6 h-6 text-purple-600" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-purple-500 transition-colors" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Retainers</h3>
          <p className="text-gray-500 text-sm mt-1">
            {activeRetainers.length} active recurring payments
          </p>
        </Link>
        <Link
          href="/finance/payments"
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-green-300 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-green-500 transition-colors" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Payments</h3>
          <p className="text-gray-500 text-sm mt-1">
            {pendingPayments.length} pending one-time payments
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Retainers Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-purple-600" />
              Active Retainers
            </h2>
            <Link
              href="/finance/retainers"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View All
            </Link>
          </div>
          <ActiveRetainersTable retainers={activeRetainers.slice(0, 5)} />
        </div>

        {/* Pending Payments Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Pending Payments
            </h2>
            <Link
              href="/finance/payments"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View All
            </Link>
          </div>
          <PendingPaymentsTable payments={pendingPayments.slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}
