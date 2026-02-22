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
import RateLimitFallback from "@/components/RateLimitFallback";
import { isRateLimitError } from "@/lib/rate-limit-utils";

export const metadata = {
  title: "ניהול עובדים | CRM",
  description: "מערכת לניהול עובדים, גיוס, קליטה והדרכה",
};

export default async function WorkersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch data with error handling + logging (P3)
  let workersResult, departments, onboardingPaths, stats, users, tables;
  try {
    [workersResult, departments, onboardingPaths, stats, users, tables] =
      await Promise.all([
        getWorkers().catch((err) => {
          if (isRateLimitError(err)) throw err;
          console.error("[Workers] Failed to load workers:", err);
          return { data: [], total: 0, hasMore: false };
        }),
        getDepartments().catch((err) => {
          if (isRateLimitError(err)) throw err;
          console.error("[Workers] Failed to load departments:", err);
          return [];
        }),
        getOnboardingPaths().catch((err) => {
          if (isRateLimitError(err)) throw err;
          console.error("[Workers] Failed to load onboarding paths:", err);
          return [];
        }),
        getWorkersStats().catch((err) => {
          if (isRateLimitError(err)) throw err;
          console.error("[Workers] Failed to load stats:", err);
          return { totalWorkers: 0, onboardingWorkers: 0, activeWorkers: 0, departments: 0, onboardingPaths: 0 };
        }),
        prisma.user
          .findMany({
            where: { companyId: user.companyId },
            select: { id: true, name: true, email: true },
            take: 1000,
          })
          .catch((err) => {
            console.error("[Workers] Failed to load users:", err);
            return [];
          }),
        prisma.tableMeta
          .findMany({
            where: { companyId: user.companyId },
            select: { id: true, name: true },
            take: 1000,
          })
          .catch((err) => {
            console.error("[Workers] Failed to load tables:", err);
            return [];
          }),
      ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  const workers = workersResult.data;

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
          userPlan={user.isPremium || "basic"}
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
