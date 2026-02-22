import { Suspense } from "react";
import TaskKanbanBoard from "@/components/TaskKanbanBoard";
import MyTaskSheets from "@/components/tasks/MyTaskSheets";
import TaskSheetsManager from "@/components/tasks/TaskSheetsManager";
import CompletedTasksList from "@/components/tasks/CompletedTasksList";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ClipboardList, LayoutGrid, Calendar, Users, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { getTasks, getDoneTasks } from "@/app/actions/tasks";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

async function getUsers(companyId: number) {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
}

async function getTaskSheets(
  companyId: number,
  isAdmin: boolean,
  userId: number,
) {
  const now = new Date();

  const sheets = await prisma.taskSheet.findMany({
    where: {
      companyId,
      isActive: true,
      ...(isAdmin
        ? {}
        : {
            assigneeId: userId,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gte: now } }],
          }),
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
      items: {
        orderBy: [{ order: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return sheets;
}

async function getMyTaskSheets(companyId: number, userId: number) {
  const now = new Date();

  const sheets = await prisma.taskSheet.findMany({
    where: {
      companyId,
      assigneeId: userId,
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
    include: {
      items: {
        orderBy: [{ isCompleted: "asc" }, { order: "asc" }],
        include: {
          linkedTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
  });

  return sheets;
}

async function getMySheetCount(companyId: number, userId: number) {
  const now = new Date();
  return prisma.taskSheet.count({
    where: {
      companyId,
      assigneeId: userId,
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
  });
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  const resolvedParams = await searchParams;
  const currentView = resolvedParams.view || "kanban";
  const isAdmin = user?.role === "admin";

  // Conditionally fetch only the data needed for the current tab
  const users = user ? await getUsers(user.companyId) : [];

  // Fetch tab-specific data only
  const tasksResult =
    currentView === "kanban" && user
      ? await getTasks()
      : null;
  const tasksError = tasksResult && !tasksResult.success ? tasksResult.error : null;
  const initialTasks = tasksResult?.data ?? [];

  const taskSheets =
    currentView === "manage-sheets" && isAdmin && user
      ? await getTaskSheets(user.companyId, isAdmin, user.id)
      : [];

  const mySheets =
    currentView === "my-sheets" && user
      ? await getMyTaskSheets(user.companyId, user.id)
      : [];

  const doneTasksResult =
    currentView === "done" && user
      ? await getDoneTasks()
      : null;
  const doneTasksError = doneTasksResult && !doneTasksResult.success ? doneTasksResult.error : null;
  const doneTasks = doneTasksResult?.data ?? [];

  // If the active view hit a rate limit, show full-page fallback
  if (
    (currentView === "kanban" && isRateLimitError(tasksError)) ||
    (currentView === "done" && isRateLimitError(doneTasksError))
  ) {
    return <RateLimitFallback />;
  }

  // Lightweight count for the tab badge (only when not already on my-sheets tab)
  const mySheetsCount =
    currentView === "my-sheets"
      ? mySheets.length
      : user
        ? await getMySheetCount(user.companyId, user.id)
        : 0;

  const tabs = [
    { id: "kanban", label: "לוח קנבן", icon: LayoutGrid },
    { id: "done", label: "משימות שבוצעו", icon: CheckCircle },
    { id: "my-sheets", label: "דפי המשימות שלי", icon: ClipboardList },
    ...(isAdmin
      ? [{ id: "manage-sheets", label: "ניהול דפי משימות", icon: Users }]
      : []),
  ];

  const ErrorBanner = ({ error }: { error: string }) => (
    <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-xl flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
      <div className="flex-1">
        <p className="text-red-300 font-medium">שגיאה בטעינת המשימות</p>
        <p className="text-red-400/70 text-sm">{error}</p>
      </div>
      <a
        href="/tasks"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        נסה שוב
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">משימות</h1>
          <p className="text-slate-400">ניהול משימות ודפי עבודה יומיים</p>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 bg-slate-800/50 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/50 w-full md:w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentView === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/tasks?view=${tab.id}`}
                  prefetch={false}
                  className={`flex items-center justify-center md:justify-start gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                    isActive
                      ? "bg-linear-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === "my-sheets" && mySheetsCount > 0 && (
                    <span className="bg-blue-500/30 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                      {mySheetsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <Suspense
          fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
          }
        >
          {currentView === "kanban" && (
            tasksError
              ? <ErrorBanner error={tasksError} />
              : <TaskKanbanBoard currentUser={user} users={users} initialTasks={initialTasks as any} />
          )}

          {currentView === "done" && (
            doneTasksError
              ? <ErrorBanner error={doneTasksError} />
              : <div>
                  <div className="mb-6 p-4 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-500/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-purple-500/20 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          משימות שבוצעו
                        </h2>
                        <p className="text-sm text-slate-400">
                          כל המשימות שסומנו כבוצעו
                        </p>
                      </div>
                    </div>
                  </div>
                  <CompletedTasksList
                    tasks={doneTasks.map((t: any) => ({
                      ...t,
                      id: String(t.id),
                      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                      createdAt: new Date(t.createdAt).toISOString(),
                      updatedAt: new Date(t.updatedAt).toISOString(),
                    }))}
                  />
                </div>
          )}

          {currentView === "my-sheets" && (
            <div>
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl border border-blue-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/20 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      דפי המשימות שלי
                    </h2>
                    <p className="text-sm text-slate-400">
                      צפה בדפי המשימות היומיים/שבועיים שהוקצו לך
                    </p>
                  </div>
                </div>
              </div>
              <MyTaskSheets
                initialSheets={mySheets.map((sheet) => ({
                  ...sheet,
                  validFrom: sheet.validFrom.toISOString(),
                  validUntil: sheet.validUntil?.toISOString() || null,
                  items: sheet.items.map((item) => ({
                    ...item,
                    completedAt: item.completedAt?.toISOString() || null,
                  })),
                }))}
              />
            </div>
          )}

          {currentView === "manage-sheets" && isAdmin && (
            <TaskSheetsManager
              initialSheets={taskSheets.map((sheet) => ({
                ...sheet,
                validFrom: sheet.validFrom.toISOString(),
                validUntil: sheet.validUntil?.toISOString() || null,
                items: sheet.items.map((item) => ({
                  ...item,
                  completedAt: item.completedAt?.toISOString() || null,
                })),
              }))}
              users={users}
              userPlan={user?.isPremium || "basic"}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
