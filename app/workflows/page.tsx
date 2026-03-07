import { Suspense } from "react";
import { getWorkflows } from "@/app/actions/workflows"; // Keep existing
import { getWorkflowInstances } from "@/app/actions/workflow-instances";
import { prisma } from "@/lib/prisma";
import { WorkflowManager } from "@/components/workflows/WorkflowManager";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export const metadata = {
  title: "תהליכי עבודה | BizlyCRM",
  description: "ניהול פייפליינים ותהליכי עבודה",
};

export default async function WorkflowsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  let workflows, rawInstances, users;
  try {
    [workflows, rawInstances, users] = await Promise.all([
      getWorkflows(),
      getWorkflowInstances(),
      prisma.user.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true },
      }),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  // Hydrate instances with workflow data from already-loaded workflows
  // to avoid fetching duplicated workflow+stages per instance from DB
  const workflowMap: Record<number, any> = {};
  for (const w of workflows as any[]) {
    workflowMap[w.id] = w;
  }
  const instances = (rawInstances as any[]).map((inst) => ({
    ...inst,
    workflow: workflowMap[inst.workflowId] || { name: "Unknown", stages: [] },
  }));

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-12" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <Suspense fallback={<WorkflowsSkeleton />}>
          <WorkflowManager
            initialWorkflows={workflows as any}
            initialInstances={instances}
            users={users}
            currentUser={user}
          />
        </Suspense>
      </div>
    </div>
  );
}

function WorkflowsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded"></div>
      <div className="flex gap-4">
        <div className="h-10 w-32 bg-gray-200 rounded"></div>
        <div className="h-10 w-32 bg-gray-200 rounded"></div>
      </div>
      <div className="h-[400px] bg-white rounded-xl border border-gray-100"></div>
    </div>
  );
}
