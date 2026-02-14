import { getArchivedGoals, getGoalCreationData } from "@/app/actions/goals";
import ArchivedGoalRow from "@/components/finance/ArchivedGoalRow";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { Archive, ArrowRight, LayoutList, Search } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";

export default async function ArchivedGoalsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!hasUserFlag(user, "canViewGoals")) {
    redirect("/");
  }

  // Fetch data
  const [goals, creationData] = await Promise.all([
    getArchivedGoals(),
    getGoalCreationData(),
  ]);

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
                <Archive className="w-6 h-6" />
              </div>
              ארכיון יעדים
            </h1>
            <p className="text-gray-500 mt-2 text-lg mr-[60px]">
              היסטוריית היעדים שהסתיימו, נמחקו או הועברו לארכיון.
            </p>
          </div>

          {/* Placeholder for search/filter if needed later */}
          {/* <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="חיפוש בארכיון..." className="pr-10 bg-white" />
           </div> */}
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Archive className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">הארכיון ריק</h3>
          <p className="text-gray-500 mt-2">אין יעדים בארכיון כרגע</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
          {/* Header Row */}
          <div className="bg-gray-50/50 border-b border-gray-100 flex items-center justify-between gap-6 px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="flex-1 min-w-[240px]">שם היעד וסוג</div>
            <div className="min-w-[160px] text-right">התקדמות ויעד</div>
            <div className="min-w-[140px] text-right pr-2">תקופת יעד</div>
            <div className="min-w-[120px] text-center">סטטוס סופי</div>
            <div className="min-w-[100px] text-left pl-2">פעולות</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {goals.map((goal) => (
              <ArchivedGoalRow key={goal.id} goal={goal} tables={tables} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
