import { Suspense } from "react";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import {
  getWorkers,
  getDepartments,
  getOnboardingPaths,
  getWorkersStats,
} from "@/app/actions/workers";
import { prisma } from "@/lib/prisma";
import WorkersManager from "@/components/workers/WorkersManager";

export const metadata = {
  title: "ניהול עובדים | CRM",
  description: "מערכת לניהול עובדים, גיוס, קליטה והדרכה",
};

export default async function WorkersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch data with error handling
  const [workers, departments, onboardingPaths, stats, users, tables] =
    await Promise.all([
      getWorkers().catch(() => []),
      getDepartments().catch(() => []),
      getOnboardingPaths().catch(() => []),
      getWorkersStats().catch(() => ({
        totalWorkers: 0,
        onboardingWorkers: 0,
        activeWorkers: 0,
        departments: 0,
        onboardingPaths: 0,
      })),
      prisma.user
        .findMany({
          where: { companyId: user.companyId },
          select: { id: true, name: true, email: true },
        })
        .catch(() => []),
      prisma.tableMeta
        .findMany({
          where: { companyId: user.companyId },
          select: { id: true, name: true },
        })
        .catch(() => []),
    ]);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"
      dir="rtl"
    >
      <Suspense fallback={<WorkersSkeleton />}>
        <WorkersManager
          initialWorkers={workers}
          initialDepartments={departments}
          initialOnboardingPaths={onboardingPaths}
          stats={stats}
          users={users}
          tables={tables}
        />
      </Suspense>
    </div>
  );
}

function WorkersSkeleton() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-10 w-48 bg-white/60 rounded-lg"></div>
        <div className="h-10 w-32 bg-white/60 rounded-lg"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white/60 rounded-xl"></div>
        ))}
      </div>
      <div className="h-[500px] bg-white/60 rounded-2xl"></div>
    </div>
  );
}
