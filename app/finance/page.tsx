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
  TrendingUp,
  Wallet,
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
      // Other stats if needed
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

  // Serialize data (convert Decimal to number) for Client Components
  const serializedActiveRetainers = activeRetainers.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));

  const serializedPendingPayments = pendingPayments.map((p) => ({
    ...p,
    amount: Number(p.amount),
  }));

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

      {/* NEW: Unified Ledger Navigation Card */}
      <Link href="/finance/income-expenses" className="block group">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg shadow-indigo-200 transition-all transform group-hover:scale-[1.01] group-hover:shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="w-6 h-6" />
                דוח הוצאות והכנסות
              </h2>
              <p className="text-indigo-100 mt-1 max-w-xl">
                נהל את כל התזרים העסקי שלך במקום אחד. מסך מרכז למעקב אחר הכנסות,
                הוצאות ורווח נקי.
              </p>
            </div>
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
              <ArrowRight className="w-6 h-6 text-white" />
            </div>
          </div>
          {/* Background Decorations */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
        </div>
      </Link>

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

      {/* Goal Planning - Prominent Section */}
      <div className="rounded-xl overflow-hidden shadow-sm border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-1 relative group">
        <Link
          href="/finance/goals"
          className="flex items-center justify-between p-6 bg-white/60 hover:bg-white/90 rounded-lg transition-all"
        >
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-100 rounded-xl group-hover:scale-110 transition-transform">
              <TrendingUp className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                Goal Planning & Forecasting
              </h3>
              <p className="text-gray-600 font-medium">
                Set monthly targets, track KPIs, and get AI-powered insights to
                grow your business.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold bg-white px-4 py-2 rounded-lg shadow-sm group-hover:shadow-md transition-all">
            Start Planning
            <ArrowRight className="w-5 h-5" />
          </div>
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
          <ActiveRetainersTable
            retainers={serializedActiveRetainers.slice(0, 5)}
          />
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
          <PendingPaymentsTable
            payments={serializedPendingPayments.slice(0, 5)}
          />
        </div>
      </div>
    </div>
  );
}
