import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { getWorker, getOnboardingPathSummaries } from "@/app/actions/workers";
import WorkerDetails from "@/components/workers/WorkerDetails";
import RateLimitFallback from "@/components/RateLimitFallback";
import { isRateLimitError } from "@/lib/rate-limit-utils";

interface Props {
  params: Promise<{ id: string }>;
}

const getCachedWorker = cache((id: number) => getWorker(id));

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Worker Details" };

  try {
    const worker = await getCachedWorker(Number(id));
    return {
      title: worker
        ? `${worker.firstName} ${worker.lastName} | Workers`
        : "Worker Details",
    };
  } catch {
    return { title: "Worker Details" };
  }
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
      getCachedWorker(Number(id)),
      getOnboardingPathSummaries(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
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
