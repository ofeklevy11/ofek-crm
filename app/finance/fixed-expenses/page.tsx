import { getFixedExpenses } from "@/app/actions/fixed-expenses";
import FixedExpensesTable from "@/components/finance/FixedExpensesTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default async function FixedExpensesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const expenses = await getFixedExpenses();

  return (
    <div className="min-h-screen bg-gray-50/50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link
              href="/finance"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-2 transition-colors"
            >
              <ArrowRight className="w-4 h-4 ml-1" />
              חזרה לפיננסים
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              הוצאות קבועות
            </h1>
            <p className="text-gray-500 mt-1 text-lg">
              ניהול תשלומים קבועים, שירותים ומינויים
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-right">
              <p className="text-sm text-gray-500 font-medium">
                סך הכל חודשי (משוער)
              </p>
              <p className="text-2xl font-bold text-gray-900">
                ₪
                {expenses
                  .filter(
                    (e: any) =>
                      e.frequency === "MONTHLY" && e.status === "ACTIVE"
                  )
                  .reduce((sum: number, e: any) => sum + e.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div className="text-right">
              <p className="text-sm text-gray-500 font-medium">הוצאות פעילות</p>
              <p className="text-2xl font-bold text-blue-600">
                {expenses.filter((e: any) => e.status === "ACTIVE").length}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <FixedExpensesTable initialExpenses={expenses} />
      </div>
    </div>
  );
}
