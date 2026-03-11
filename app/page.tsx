import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import LandingPage from "@/components/LandingPage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
