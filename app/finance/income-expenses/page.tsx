import { Suspense } from "react";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import FinanceLedger from "@/components/finance/FinanceLedger";
import AddTransactionModal from "@/components/finance/AddTransactionModal";
import { Card } from "@/components/ui/card";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  TrendingUp,
  HandCoins,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSyncRules } from "@/app/actions/finance-sync";
import SyncRulesDialog from "@/components/finance/SyncRulesDialog";

async function getFinanceStats(companyId: number) {
  const records = await prisma.financeRecord.findMany({
    where: { companyId },
  });

  const income = records
    .filter((r) => r.type === "INCOME")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const expense = records
    .filter((r) => r.type === "EXPENSE")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return { income, expense, profit: income - expense };
}

export default async function IncomeExpensesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch stats and existing rules
  const [stats, rules] = await Promise.all([
    getFinanceStats(user.companyId),
    getSyncRules(),
  ]);

  const rawRecords = await prisma.financeRecord.findMany({
    where: { companyId: user.companyId },
    orderBy: { date: "desc" },
    include: {
      syncRule: { select: { sourceType: true, name: true } },
      client: { select: { name: true } }, // Also useful to have client name if not already there
    },
  });

  // Serialize Decimal records for client component
  const localizedRecords = rawRecords.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));

  return (
    <div className="min-h-screen bg-gray-50/50 p-8 space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            הכנסות והוצאות
          </h1>
          <p className="text-gray-500 mt-1">
            ניהול תزרימי המזומנים של העסק במקום אחד
          </p>
        </div>
        <div className="flex gap-3">
          <SyncRulesDialog rules={rules} />

          <Link href="/finance/collect">
            <Button
              variant="outline"
              className="gap-2 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-sm"
            >
              <HandCoins className="w-4 h-4" />
              איסוף נתונים דינמי
            </Button>
          </Link>
          <AddTransactionModal />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">סה״כ הכנסות</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">
                ₪{stats.income.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <ArrowUpCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">סה״כ הוצאות</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">
                ₪{stats.expense.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <ArrowDownCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-shadow bg-indigo-50/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">רווח נקי</p>
              <h3
                className={`text-3xl font-bold mt-2 ${
                  stats.profit >= 0 ? "text-indigo-900" : "text-red-600"
                }`}
              >
                ₪{stats.profit.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <Wallet className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Ledger Table */}
      <FinanceLedger initialRecords={localizedRecords} />
    </div>
  );
}
