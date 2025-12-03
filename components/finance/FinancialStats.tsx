import { DollarSign, CreditCard, Activity, TrendingUp } from "lucide-react";

interface FinancialStatsProps {
  totalRevenue: number;
  outstandingDebt: number;
  activeRetainers: number;
  collectionRate: number;
}

export function FinancialStats({
  totalRevenue,
  outstandingDebt,
  activeRetainers,
  collectionRate,
}: FinancialStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            Monthly Revenue (MRR)
          </h3>
          <DollarSign className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            ₪{totalRevenue.toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">+20.1% from last month</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            Outstanding Debt
          </h3>
          <CreditCard className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-red-600">
            ₪{outstandingDebt.toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 mt-1">Needs attention</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            Active Retainers
          </h3>
          <Activity className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            {activeRetainers}
          </div>
          <p className="text-xs text-gray-500 mt-1">+2 new this month</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="tracking-tight text-sm font-medium text-gray-500">
            Collection Rate
          </h3>
          <TrendingUp className="h-4 w-4 text-gray-500" />
        </div>
        <div className="pt-2">
          <div className="text-2xl font-bold text-gray-900">
            {collectionRate}%
          </div>
          <p className="text-xs text-gray-500 mt-1">+4% from last month</p>
        </div>
      </div>
    </div>
  );
}
