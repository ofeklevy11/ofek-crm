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
  churnRate?: number;
  cancelledRetainersCount?: number;
  retainerCollectionRate?: number;
  newRetainersLast30Days?: number;
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
  churnRate = 0,
  cancelledRetainersCount = 0,
  retainerCollectionRate = 0,
  newRetainersLast30Days = 0,
}: FinancialStatsProps) {
  return (
    <div role="region" aria-label="מדדים פיננסיים" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 id="stat-mrr" className="tracking-tight text-sm font-medium text-gray-500">
            הכנסה חודשית קבועה (MRR)
          </h3>
          <DollarSign className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="pt-2">
          <div aria-labelledby="stat-mrr" className="text-2xl font-bold text-gray-900">
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
          <h3 id="stat-debt" className="tracking-tight text-sm font-medium text-gray-500">
            חובות פתוחים
          </h3>
          <CreditCard className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="pt-2">
          <div aria-labelledby="stat-debt" className="text-2xl font-bold text-[#a24ec1]">
            ₪{outstandingDebt.toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {collectionRate}% שיעור גבייה
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 id="stat-active-retainers" className="tracking-tight text-sm font-medium text-gray-500">
            ריטיינרים פעילים
          </h3>
          <Activity className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="pt-2">
          <div aria-labelledby="stat-active-retainers" className="text-2xl font-bold text-gray-900">
            {activeRetainers}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            +{newRetainersLast30Days} ב-30 הימים האחרונים
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 id="stat-churn" className="tracking-tight text-sm font-medium text-gray-500">
            שיעור עזיבת ריטיינרים
          </h3>
          <TrendingUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="pt-2">
          <div aria-labelledby="stat-churn" className="text-2xl font-bold text-gray-900">{churnRate}%</div>
          <p className="text-xs text-gray-500 mt-1">
            {cancelledRetainersCount} ריטיינרים עזבו
          </p>
        </div>
      </div>
    </div>
  );
}
