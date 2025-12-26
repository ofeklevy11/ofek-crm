import { GoalWithProgress } from "@/app/actions/goals";
import GoalCard from "./GoalCard";
import { AlertCircle } from "lucide-react";

interface GoalListProps {
  goals: GoalWithProgress[];
  metrics: any[];
  tables: any[];
}

export default function GoalList({ goals, metrics, tables }: GoalListProps) {
  if (goals.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
        <div className="mx-auto w-12 h-12 bg-[#4f95ff]/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-[#4f95ff]" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">
          עדיין לא הוגדרו יעדים
        </h3>
        <p className="text-gray-500 mt-2 max-w-sm mx-auto">
          התחל לתכנן את ההצלחה העסקית שלך על ידי הגדרת יעדים ברורים ומדידים.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6"
      dir="rtl"
    >
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} metrics={metrics} tables={tables} />
      ))}
    </div>
  );
}
