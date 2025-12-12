import { Suspense } from "react";
import { getWorkflows } from "@/app/actions/workflows"; // Keep existing
import { getWorkflowInstances } from "@/app/actions/workflow-instances";
import { prisma } from "@/lib/prisma";
import { WorkflowManager } from "@/components/workflows/WorkflowManager";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "תהליכי עבודה | CRM",
  description: "ניהול פייפליינים ותהליכי עבודה",
};

export default async function WorkflowsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // @ts-ignore - DB model might not exist yet if migration pending
  const workflows = await getWorkflows().catch(() => []);
  // @ts-ignore
  const instances = await getWorkflowInstances().catch(() => []);
  // @ts-ignore
  const users = await prisma.user
    .findMany({ where: { companyId: user.companyId } })
    .catch(() => []);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-12" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <Suspense fallback={<WorkflowsSkeleton />}>
          <WorkflowManager
            initialWorkflows={workflows}
            initialInstances={instances}
            users={users}
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
