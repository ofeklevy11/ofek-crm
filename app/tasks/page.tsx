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
import type { Metadata } from "next";

export const metadata: Metadata = { title: "משימות | BizlyCRM" };

async function getUsers(companyId: number) {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, name: true },
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
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
      items: {
        orderBy: [{ order: "asc" }],
        select: {
          id: true, sheetId: true, title: true, description: true,
          priority: true, category: true, order: true, dueTime: true,
          isCompleted: true, completedAt: true, notes: true,
          linkedTaskId: true, onCompleteActions: true,
          createdAt: true, updatedAt: true,
        },
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
        orderBy: [{ isCompleted: "asc" }, { priority: "asc" }, { order: "asc" }],
        select: {
          id: true, sheetId: true, title: true, description: true,
          priority: true, category: true, order: true, dueTime: true,
          isCompleted: true, completedAt: true, notes: true,
          linkedTaskId: true, onCompleteActions: true,
          createdAt: true, updatedAt: true,
          linkedTask: {
            select: { id: true, title: true, status: true, priority: true },
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

  // Fetch all independent data in parallel
  const viewDataPromise = (() => {
    if (!user) return Promise.resolve(null);
    switch (currentView) {
      case "kanban": return getTasks();
      case "done": return getDoneTasks();
      case "my-sheets": return getMyTaskSheets(user.companyId, user.id);
      case "manage-sheets": return isAdmin ? getTaskSheets(user.companyId, isAdmin, user.id) : Promise.resolve([]);
      default: return Promise.resolve(null);
    }
  })();

  const usersPromise = user ? getUsers(user.companyId) : Promise.resolve([]);
  const sheetCountPromise = currentView !== "my-sheets" && user
    ? getMySheetCount(user.companyId, user.id)
    : Promise.resolve(0);

  const [viewData, users, mySheetsCountRaw] = await Promise.all([
    viewDataPromise,
    usersPromise,
    sheetCountPromise,
  ]);

  // Destructure viewData based on currentView
  const tasksResult = currentView === "kanban" ? viewData as Awaited<ReturnType<typeof getTasks>> | null : null;
  const tasksError = tasksResult && !tasksResult.success ? tasksResult.error : null;
  const initialTasks = tasksResult?.data ?? [];

  const doneTasksResult = currentView === "done" ? viewData as Awaited<ReturnType<typeof getDoneTasks>> | null : null;
  const doneTasksError = doneTasksResult && !doneTasksResult.success ? doneTasksResult.error : null;
  const doneTasks = doneTasksResult?.data ?? [];

  const mySheets = currentView === "my-sheets" ? (viewData as Awaited<ReturnType<typeof getMyTaskSheets>>) || [] : [];
  const taskSheets = currentView === "manage-sheets" ? (viewData as Awaited<ReturnType<typeof getTaskSheets>>) || [] : [];

  // If the active view hit a rate limit, show full-page fallback
  if (
    (currentView === "kanban" && isRateLimitError(tasksError)) ||
    (currentView === "done" && isRateLimitError(doneTasksError))
  ) {
    return <RateLimitFallback />;
  }

  const mySheetsCount = currentView === "my-sheets" ? mySheets.length : mySheetsCountRaw;

  const tabs = [
    { id: "kanban", label: "לוח קנבן", icon: LayoutGrid },
    { id: "done", label: "משימות שבוצעו", icon: CheckCircle },
    { id: "my-sheets", label: "דפי המשימות שלי", icon: ClipboardList },
    ...(isAdmin
      ? [{ id: "manage-sheets", label: "ניהול דפי משימות", icon: Users }]
      : []),
  ];

  const ErrorBanner = ({ error }: { error: string }) => (
    <div role="alert" className="p-4 bg-red-900/30 border border-red-500/30 rounded-xl flex items-center gap-3">
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
      <a
        href="#tasks-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:right-2 focus:bg-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:text-blue-600 focus:ring-2 focus:ring-blue-500"
      >
        דלג לתוכן המשימות
      </a>
      <main className="w-full px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 id="tasks-heading" className="text-4xl font-bold text-white mb-2">משימות</h1>
          <p className="text-slate-400">ניהול משימות ודפי עבודה יומיים</p>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav aria-label="תצוגות משימות" className="flex flex-col md:flex-row items-stretch md:items-center gap-2 bg-slate-800/50 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/50 w-full md:w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentView === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/tasks?view=${tab.id}`}
                  prefetch={false}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-center md:justify-start gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                    isActive
                      ? "bg-linear-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {tab.label}
                  {tab.id === "my-sheets" && mySheetsCount > 0 && (
                    <span className="bg-blue-500/30 text-blue-300 text-xs px-2 py-0.5 rounded-full" aria-label={`${mySheetsCount} דפי משימות`}>
                      {mySheetsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div id="tasks-content">
        <Suspense
          fallback={
            <div className="flex justify-center items-center h-64" role="status">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
              <span className="sr-only">טוען...</span>
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
                      <div className="p-2.5 bg-purple-500/20 rounded-lg" aria-hidden="true">
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
                  <div className="p-2.5 bg-blue-500/20 rounded-lg" aria-hidden="true">
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
      </main>
    </div>
  );
}
