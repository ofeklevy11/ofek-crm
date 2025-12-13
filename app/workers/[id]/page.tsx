import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import { getWorker, getOnboardingPaths } from "@/app/actions/workers";
import WorkerDetails from "@/components/workers/WorkerDetails";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const worker = await getWorker(Number(id)).catch(() => null);
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

  const [worker, onboardingPaths] = await Promise.all([
    getWorker(Number(id)),
    getOnboardingPaths(),
  ]);

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
