import { DollarSign, CreditCard, Activity, TrendingUp } from "lucide-react";

interface FinancialStatsProps {
  totalRevenue: number;
  outstandingDebt: number;
  activeRetainers: number;
  collectionRate: number;
  newMrr?: number;
  overdueCount?: number;
  newRetainersCount?: number;
  totalCollected?: number;
}

export default function FinancialStats({
  totalRevenue,
  outstandingDebt,
  activeRetainers,
  collectionRate,
  newMrr = 0,
  overdueCount = 0,
  newRetainersCount = 0,
  totalCollected = 0,
}: FinancialStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            הכנסה חודשית קבועה (MRR)
          </h3>
          <DollarSign className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            ₪{totalRevenue.toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {newMrr > 0
              ? `+₪${newMrr.toLocaleString()} החודש`
              : "ללא שינוי החודש"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            חובות פתוחים
          </h3>
          <CreditCard className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-[#a24ec1]">
            ₪{outstandingDebt.toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {overdueCount > 0
              ? `${overdueCount} תשלומים באיחור`
              : "אין תשלומים באיחור"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            ריטיינרים פעילים
          </h3>
          <Activity className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            {activeRetainers}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {newRetainersCount > 0
              ? `+${newRetainersCount} חדשים החודש`
              : "אין ריטיינרים חדשים החודש"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            שיעור גבייה
          </h3>
          <TrendingUp className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            {collectionRate}%
          </div>
          <p className="text-xs text-gray-500 mt-1">
            נאספו ₪{totalCollected.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
