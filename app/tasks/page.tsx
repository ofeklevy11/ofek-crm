import { Suspense } from "react";
import TaskKanbanBoard from "@/components/TaskKanbanBoard";
import MyTaskSheets from "@/components/tasks/MyTaskSheets";
import TaskSheetsManager from "@/components/tasks/TaskSheetsManager";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ClipboardList, LayoutGrid, Calendar, Users } from "lucide-react";
import { getTasks } from "@/app/actions/tasks";

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
  const initialTasks = tasksResult?.data ?? [];

  const taskSheets =
    currentView === "manage-sheets" && isAdmin && user
      ? await getTaskSheets(user.companyId, isAdmin, user.id)
      : [];

  const mySheets =
    currentView === "my-sheets" && user
      ? await getMyTaskSheets(user.companyId, user.id)
      : [];

  // Lightweight count for the tab badge (only when not already on my-sheets tab)
  const mySheetsCount =
    currentView === "my-sheets"
      ? mySheets.length
      : user
        ? await getMySheetCount(user.companyId, user.id)
        : 0;

  const tabs = [
    { id: "kanban", label: "לוח קנבן", icon: LayoutGrid },
    { id: "my-sheets", label: "דפי המשימות שלי", icon: ClipboardList },
    ...(isAdmin
      ? [{ id: "manage-sheets", label: "ניהול דפי משימות", icon: Users }]
      : []),
  ];

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
            <TaskKanbanBoard currentUser={user} users={users} initialTasks={initialTasks} />
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
