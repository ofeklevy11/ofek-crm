import { getGoalsWithProgress, getGoalCreationData } from "@/app/actions/goals";
import GoalList from "@/components/finance/GoalList";
import GoalModal from "@/components/finance/GoalModal";
import { getCurrentUser } from "@/lib/permissions-server";
import { Target, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";

export default async function GoalsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch data
  const [goals, creationData] = await Promise.all([
    getGoalsWithProgress(),
    getGoalCreationData(),
  ]);

  const { clients, tables } = creationData;

  // Static metrics definition
  const metrics = [
    {
      type: "REVENUE",
      name: "הכנסות",
      description: "סה״כ כסף שנכנס",
      available: true,
      icon: "💰",
    },
    {
      type: "RETAINERS",
      name: "ריטיינרים",
      description: "הכנסות חוזרות",
      available: true,
      icon: "💼",
    },
    {
      type: "LEADS",
      name: "לידים",
      description: "לקוחות חדשים",
      available: true,
      icon: "👥",
    },
    {
      type: "QUOTES",
      name: "הצעות מחיר",
      description: "הצעות וסגירות",
      available: true,
      icon: "📝",
    },
  ];

  return (
    <div className="p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <Target className="w-8 h-8 text-blue-600" />
            Goal Planning
          </h1>
          <p className="text-gray-500 mt-2 text-lg">
            Track key business metrics, forecast growth, and stay on target.
          </p>
        </div>

        <GoalModal metrics={metrics} tables={tables} clients={clients} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-medium text-gray-600">Active Goals</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {goals.filter((g) => g.isActive).length}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-medium text-gray-600">On Track</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {
              goals.filter(
                (g: any) => g.status === "ON_TRACK" || g.status === "EXCEEDED"
              ).length
            }
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Your Goals Dashboard
        </h2>
        {/* Pass metrics to GoalList if it needs them, otherwise update GoalList to not need them or use these static ones */}
        <GoalList goals={goals} metrics={metrics} tables={tables} />
      </div>
    </div>
  );
}
