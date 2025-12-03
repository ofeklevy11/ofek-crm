import { FinancialStats } from "@/components/finance/FinancialStats";
import TransactionsTable from "@/components/finance/TransactionsTable";
import { Plus, Users, CreditCard, Repeat, TrendingUp } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function FinancePage() {
  // Fetch real data from database
  const transactions = await prisma.transaction.findMany({
    include: { client: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const clients = await prisma.client.findMany({
    include: {
      retainers: true,
      oneTimePayments: true,
      transactions: true,
    },
  });

  const activeRetainers = await prisma.retainer.findMany({
    where: { status: "active" },
  });

  const totalRevenue = await prisma.transaction.aggregate({
    where: { status: "manual-marked-paid" },
    _sum: { amount: true },
  });

  const outstandingDebt = await prisma.oneTimePayment.aggregate({
    where: { status: { in: ["pending", "overdue"] } },
    _sum: { amount: true },
  });

  const stats = {
    totalRevenue: Number(totalRevenue._sum.amount || 0),
    outstandingDebt: Number(outstandingDebt._sum.amount || 0),
    activeRetainers: activeRetainers.length,
    collectionRate: 92, // Calculate based on paid vs total
  };

  // Format transactions for the table
  const formattedTransactions = transactions.map((t) => ({
    id: t.id,
    client: { id: t.clientId, name: t.client.name },
    relatedType: t.relatedType,
    title: t.notes || `${t.relatedType} payment`,
    amount: Number(t.amount),
    dueDate: t.attemptDate.toISOString().split("T")[0],
    status: t.status,
    paidDate: t.paidDate?.toISOString().split("T")[0],
  }));

  return (
    <div className="p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Financial Hub
          </h1>
          <p className="text-gray-500 mt-1">
            Manage retainers, payments, and financial health.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/finance/retainers/new"
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Retainer
          </Link>
          <Link
            href="/finance/payments/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Payment
          </Link>
        </div>
      </div>

      {/* Finance Sub-Pages Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/finance/clients"
          className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Clients</h3>
              <p className="text-sm text-gray-500 mt-1">
                {clients.length} total clients
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/finance/retainers"
          className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-green-300 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <Repeat className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Retainers</h3>
              <p className="text-sm text-gray-500 mt-1">
                {activeRetainers.length} active retainers
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/finance/payments"
          className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-purple-300 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Payments</h3>
              <p className="text-sm text-gray-500 mt-1">One-time payments</p>
            </div>
          </div>
        </Link>
      </div>

      <FinancialStats {...stats} />

      <TransactionsTable transactions={formattedTransactions} />
    </div>
  );
}
