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
  ArrowRight,
  HandCoins,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSyncRules } from "@/app/actions/finance-sync";
import SyncRulesDialog from "@/components/finance/SyncRulesDialog";
import { processFixedExpenses } from "@/app/actions/fixed-expenses";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

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

  // Ensure fixed expenses are generated up to date
  await processFixedExpenses();

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
    <div className="min-h-screen bg-[#f4f8f8] p-8 space-y-8" dir="rtl">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link
            href="/finance"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-2 transition-colors"
          >
            <ArrowRight className="w-4 h-4 ml-1" />
            חזרה למרכז הפיננסי
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            הכנסות והוצאות
          </h1>
          <p className="text-gray-500 mt-1">
            ניהול תזרימי המזומנים של העסק במקום אחד
          </p>
        </div>
        <div className="flex gap-3">
          <SyncRulesDialog rules={rules} />

          <Link href="/finance/collect">
            <Button
              variant="outline"
              className="gap-2 bg-white border-[#a24ec1] text-[#a24ec1] hover:bg-purple-50 hover:text-[#a24ec1] shadow-sm"
            >
              <HandCoins className="w-4 h-4" />
              איסוף נתונים דינמי
            </Button>
          </Link>
          <AddTransactionModal />
        </div>
      </div>

      <Alert
        className="bg-blue-50/50 border-blue-100 text-blue-900 shadow-sm"
        dir="rtl"
      >
        <Info className="h-4 w-4 stroke-blue-600" />
        <AlertTitle className="mr-2 font-bold mb-1">סנכרון נתונים</AlertTitle>
        <AlertDescription className="mr-2 text-blue-800/90 leading-relaxed">
          הנתונים המוצגים מבוססים על חוקי האיסוף הפעילים. כדי לוודא שכל הנתונים
          עדכניים (כולל עסקאות שבוצעו לאחרונה), מומלץ להיכנס ל"ניהול חוקי איסוף"
          ולהריץ סנכרון.
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-l-[#4f95ff] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">סה״כ הכנסות</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">
                ₪{stats.income.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-[#4f95ff]/10 rounded-lg">
              <ArrowUpCircle className="w-6 h-6 text-[#4f95ff]" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-[#a24ec1] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">סה״כ הוצאות</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">
                ₪{stats.expense.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-[#a24ec1]/10 rounded-lg">
              <ArrowDownCircle className="w-6 h-6 text-[#a24ec1]" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-gray-500 shadow-sm hover:shadow-md transition-shadow bg-gray-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">רווח נקי</p>
              <h3
                className={`text-3xl font-bold mt-2 ${
                  stats.profit >= 0 ? "text-[#4f95ff]" : "text-[#a24ec1]"
                }`}
              >
                ₪{stats.profit.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-gray-200 rounded-lg">
              <Wallet className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Ledger Table */}
      <FinanceLedger initialRecords={localizedRecords} />
    </div>
  );
}
