import { getArchivedGoals, getGoalCreationData } from "@/app/actions/goals";
import ArchivedGoalRow from "@/components/finance/ArchivedGoalRow";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { Archive, ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ארכיון יעדים | CRM",
};

export default async function ArchivedGoalsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!hasUserFlag(user, "canViewGoals")) {
    redirect("/dashboard");
  }

  // Fetch data (rate-limit enforced inside getArchivedGoals/getGoalCreationData via requireGoalUser)
  let goals, creationData;
  try {
    [goals, creationData] = await Promise.all([
      getArchivedGoals(),
      getGoalCreationData(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  const { tables } = creationData;

  return (
    <div
      className="p-4 md:p-8 space-y-8 bg-[#f4f8f8] min-h-screen text-right"
      dir="rtl"
    >
      <div>
        <Link
          href="/finance/goals"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors font-medium bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm hover:shadow"
        >
          <ArrowRight className="w-4 h-4 ml-1.5" />
          חזרה ליעדים פעילים
        </Link>
        <div className="flex justify-between items-end mt-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-2xl border border-gray-100 flex items-center justify-center shadow-sm text-gray-500">
                <Archive className="w-6 h-6" aria-hidden="true" />
              </div>
              ארכיון יעדים
            </h1>
            <p className="text-gray-500 mt-2 text-lg mr-[60px]">
              היסטוריית היעדים שהסתיימו, נמחקו או הועברו לארכיון.
            </p>
          </div>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Archive className="w-8 h-8 text-gray-300" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">הארכיון ריק</h2>
          <p className="text-gray-500 mt-2">אין יעדים בארכיון כרגע</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <caption className="sr-only">ארכיון יעדים</caption>
            <thead className="bg-gray-50/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">שם היעד וסוג</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">התקדמות ויעד</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">תקופת יעד</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">סטטוס סופי</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {goals.map((goal) => (
                <ArchivedGoalRow key={goal.id} goal={goal} tables={tables} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
