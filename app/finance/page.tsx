import { prisma } from "@/lib/prisma";
import FinancialStats from "@/components/finance/FinancialStats";
import ActiveRetainersTable from "@/components/finance/ActiveRetainersTable";
import PendingPaymentsTable from "@/components/finance/PendingPaymentsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { PAID_STATUS_VARIANTS } from "@/lib/finance-constants";
import {
  Plus,
  ArrowRight,
  CreditCard,
  Repeat,
  AlertCircle,
  TrendingUp,
  Wallet,
  Briefcase,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // P5: Use Promise.allSettled so one failed query doesn't crash the whole dashboard
  const results = await Promise.allSettled([
    // Recent transactions for display (already bounded)
    prisma.transaction.findMany({
      where: { companyId: user.companyId, deletedAt: null }, // P6+P3
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Top 5 active retainers for display (with client name)
    prisma.retainer.findMany({
      where: { status: "active", companyId: user.companyId, deletedAt: null }, // P6+P3
      include: { client: { select: { id: true, name: true } } },
      orderBy: { nextDueDate: "asc" },
      take: 5,
    }),
    // All active retainers — minimal fields for MRR/growth stats (no client join)
    prisma.retainer.findMany({
      where: { status: "active", companyId: user.companyId, deletedAt: null }, // P6+P3
      select: { amount: true, frequency: true, createdAt: true },
      take: 500,
    }),
    // Top 5 pending payments for display (with client name)
    prisma.oneTimePayment.findMany({
      where: { status: { in: ["pending", "overdue"] }, companyId: user.companyId, deletedAt: null }, // P6+P3
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    // DB-level aggregate for outstanding debt + count
    prisma.oneTimePayment.aggregate({
      where: { status: { in: ["pending", "overdue"] }, companyId: user.companyId, deletedAt: null }, // P6+P3
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Overdue count at DB level
    prisma.oneTimePayment.count({
      where: {
        companyId: user.companyId, deletedAt: null, // P6+P3
        OR: [
          { status: "overdue" },
          { status: "pending", dueDate: { lt: now } },
        ],
      },
    }),
    // Paid revenue stats for collection rate
    prisma.oneTimePayment.aggregate({
      _sum: { amount: true },
      _count: { id: true },
      where: {
        companyId: user.companyId, deletedAt: null, // P6+P3
        status: { in: PAID_STATUS_VARIANTS as unknown as string[] },
      },
    }),
    prisma.retainer.count({
      where: { status: "cancelled", companyId: user.companyId, deletedAt: null }, // P6+P3
    }),
  ]);

  // P5: Extract values with safe defaults for failed queries
  const settled = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === "fulfilled" ? r.value : fallback;

  const transactions = settled(results[0], [] as any);
  const displayRetainers = settled(results[1], [] as any);
  const retainerStatsData = settled(results[2], [] as any);
  const displayPayments = settled(results[3], [] as any);
  const outstandingStats = settled(results[4], { _sum: { amount: null }, _count: { id: 0 } } as any);
  const overdueCount = settled(results[5], 0);
  const transactionStats = settled(results[6], { _sum: { amount: null }, _count: { id: 0 } } as any);
  const cancelledRetainersCount = settled(results[7], 0);

  // Calculate totals
  const totalPaidAmount = Number(transactionStats?._sum?.amount || 0);
  const paidCount = Number(transactionStats?._count?.id || 0);

  // New retainers this month
  const newRetainersThisMonth = retainerStatsData.filter(
    (r) => new Date(r.createdAt) >= firstDayOfMonth,
  ).length;

  // New MRR added this month
  const newMrrThisMonth = retainerStatsData
    .filter((r) => new Date(r.createdAt) >= firstDayOfMonth)
    .reduce((sum, r) => {
      const amount = Number(r.amount);
      const freq = r.frequency ? r.frequency.toLowerCase() : "monthly";
      if (freq === "yearly") return sum + amount / 12;
      return sum + amount;
    }, 0);

  // MRR Calculation
  const mrr = retainerStatsData.reduce((sum, r) => {
    const amount = Number(r.amount);
    const freq = r.frequency ? r.frequency.toLowerCase() : "monthly";
    if (freq === "yearly") return sum + amount / 12;
    if (freq === "weekly") return sum + amount * 4.33;
    return sum + amount;
  }, 0);

  const outstandingDebt = Number(outstandingStats?._sum?.amount || 0);
  const outstandingCount = Number(outstandingStats?._count?.id || 0);

  // Collection Rate
  const totalCount = paidCount + outstandingCount;
  const collectionRate =
    totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  // Churn Rate
  const totalRetainersForChurn =
    retainerStatsData.length + cancelledRetainersCount;
  const churnRate =
    totalRetainersForChurn > 0
      ? Math.round((cancelledRetainersCount / totalRetainersForChurn) * 100)
      : 0;

  const newRetainersLast30Days = retainerStatsData.filter(
    (r) => new Date(r.createdAt) >= thirtyDaysAgo,
  ).length;

  // Serialize for Client Components
  const serializedActiveRetainers = displayRetainers.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));

  const serializedPendingPayments = displayPayments.map((p) => ({
    ...p,
    amount: Number(p.amount),
  }));

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#f4f8f8] min-h-screen" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            ניהול כספים
          </h1>
          <p className="text-gray-500 mt-1">סקירה כללית של כספי העסק</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/finance/retainers/new"
            prefetch={false}
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 ml-2" />
            ריטיינר חדש
          </Link>
          <Link
            href="/finance/payments/new"
            prefetch={false}
            className="inline-flex items-center px-4 py-2 bg-[#4f95ff] text-white rounded-lg hover:bg-[#4f95ff]/90 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 ml-2" />
            תשלום חדש
          </Link>
        </div>
      </div>

      {/* NEW: Unified Ledger Navigation Card */}
      <Link
        href="/finance/income-expenses"
        prefetch={false}
        className="block group"
      >
        <div className="bg-linear-to-r from-[#4f95ff] to-[#a24ec1] rounded-xl p-6 text-white shadow-lg shadow-blue-200 transition-all transform group-hover:scale-[1.01] group-hover:shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="w-6 h-6" />
                דוח הוצאות והכנסות
              </h2>
              <p className="text-blue-50 mt-1 max-w-xl">
                נהל את כל התזרים העסקי שלך במקום אחד. מסך מרכז למעקב אחר הכנסות,
                הוצאות ורווח נקי.
              </p>
            </div>
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
              <ArrowRight className="w-6 h-6 text-white rotate-180" />
            </div>
          </div>
          {/* Background Decorations */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
        </div>
      </Link>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link
          href="/finance/clients"
          prefetch={false}
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-[#4f95ff]/50 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-[#4f95ff]/10 rounded-lg group-hover:bg-[#4f95ff]/20 transition-colors">
              <CreditCard className="w-6 h-6 text-[#4f95ff]" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#4f95ff] transition-colors rotate-180" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">לקוחות</h3>
          <p className="text-gray-500 text-sm mt-1">
            ניהול תיקי לקוחות והיסטוריה
          </p>
        </Link>
        <Link
          href="/finance/retainers"
          prefetch={false}
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-[#a24ec1]/50 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-[#a24ec1]/10 rounded-lg group-hover:bg-[#a24ec1]/20 transition-colors">
              <Repeat className="w-6 h-6 text-[#a24ec1]" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#a24ec1] transition-colors rotate-180" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">ריטיינרים</h3>
          <p className="text-gray-500 text-sm mt-1">
            {retainerStatsData.length} תשלומים חוזרים פעילים
          </p>
        </Link>
        <Link
          href="/finance/payments"
          prefetch={false}
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-[#4f95ff]/50 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-[#4f95ff]/10 rounded-lg group-hover:bg-[#4f95ff]/20 transition-colors">
              <CreditCard className="w-6 h-6 text-[#4f95ff]" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#4f95ff] transition-colors rotate-180" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">תשלומים</h3>
          <p className="text-gray-500 text-sm mt-1">
            {outstandingCount} תשלומים חד-פעמיים בהמתנה
          </p>
        </Link>
        <Link
          href="/finance/fixed-expenses"
          prefetch={false}
          className="group p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-[#a24ec1]/50 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-[#a24ec1]/10 rounded-lg group-hover:bg-[#a24ec1]/20 transition-colors">
              <Briefcase className="w-6 h-6 text-[#a24ec1]" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#a24ec1] transition-colors rotate-180" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">הוצאות קבועות</h3>
          <p className="text-gray-500 text-sm mt-1">
            ניהול הוצאות חודשיות קבועות
          </p>
        </Link>
      </div>

      {/* Stats Cards */}
      <FinancialStats
        totalRevenue={mrr}
        outstandingDebt={outstandingDebt}
        activeRetainers={retainerStatsData.length}
        collectionRate={collectionRate}
        newMrr={newMrrThisMonth}
        overdueCount={overdueCount} // Keeping for now, likely replacing in component
        newRetainersCount={newRetainersThisMonth} // Keeping for now
        totalCollected={totalPaidAmount}
        churnRate={churnRate}
        cancelledRetainersCount={cancelledRetainersCount}
        newRetainersLast30Days={newRetainersLast30Days}
      />

      {/* Goal Planning - Prominent Section */}
      <div className="rounded-xl overflow-hidden shadow-sm border border-[#4f95ff]/20 bg-linear-to-r from-[#4f95ff]/5 to-[#a24ec1]/5 p-1 relative group">
        <Link
          href="/finance/goals"
          prefetch={false}
          className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 bg-white/60 hover:bg-white/90 rounded-lg transition-all gap-6"
        >
          <div className="flex items-center gap-6">
            <div className="p-4 bg-[#4f95ff]/10 rounded-xl group-hover:scale-110 transition-transform">
              <TrendingUp className="w-8 h-8 text-[#4f95ff]" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                תכנון יעדים ותחזיות
              </h3>
              <p className="text-gray-600 font-medium">
                הגדר יעדים חודשיים, עקוב אחר מדדים וקבל תובנות מבוססות AI לצמיחת
                העסק.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#4f95ff] font-bold bg-white px-4 py-2 rounded-lg shadow-sm group-hover:shadow-md transition-all">
            התחל לתכנן
            <ArrowRight className="w-5 h-5 rotate-180" />
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Retainers Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-[#a24ec1]" />
              ריטיינרים פעילים
            </h2>
            <Link
              href="/finance/retainers"
              prefetch={false}
              className="text-sm text-[#4f95ff] hover:text-[#4f95ff]/80 font-medium"
            >
              צפה בהכל
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
              <AlertCircle className="w-5 h-5 text-[#4f95ff]" />
              תשלומים בהמתנה
            </h2>
            <Link
              href="/finance/payments"
              prefetch={false}
              className="text-sm text-[#4f95ff] hover:text-[#4f95ff]/80 font-medium"
            >
              צפה בהכל
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
