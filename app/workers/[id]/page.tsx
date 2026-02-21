import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { getWorker, getOnboardingPathSummaries } from "@/app/actions/workers";
import { prisma } from "@/lib/prisma";
import WorkerDetails from "@/components/workers/WorkerDetails";
import RateLimitFallback from "@/components/RateLimitFallback";

interface Props {
  params: Promise<{ id: string }>;
}

const getWorkerName = cache(async (id: number, companyId: number) => {
  return prisma.worker
    .findFirst({
      where: { id, companyId, deletedAt: null },
      select: { firstName: true, lastName: true },
    })
    .catch(() => null);
});

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const worker = user
    ? await getWorkerName(Number(id), user.companyId)
    : null;
  return {
    title: worker
      ? `${worker.firstName} ${worker.lastName} | Workers`
      : "Worker Details",
  };
}

export default async function WorkerPage({ params }: Props) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  let worker;
  let onboardingPaths;

  try {
    [worker, onboardingPaths] = await Promise.all([
      getWorker(Number(id)),
      getOnboardingPathSummaries(),
    ]);
  } catch (e: any) {
    if (e?.message?.includes("יותר מדי פניות")) {
      return <RateLimitFallback />;
    }
    throw e;
  }

  if (!worker) {
    notFound();
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"
      dir="rtl"
    >
      <WorkerDetails worker={worker} availablePaths={onboardingPaths} />
    </div>
  );
}
