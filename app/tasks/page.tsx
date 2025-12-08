import TaskKanbanBoard from "@/components/TaskKanbanBoard";
import { getCurrentUser } from "@/lib/permissions-server";

export default async function TasksPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">משימות</h1>
          <p className="text-slate-400">ניהול משימות בצורה ויזואלית</p>
        </div>

        <TaskKanbanBoard currentUser={user} />
      </div>
    </div>
  );
}
