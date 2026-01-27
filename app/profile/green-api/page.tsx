import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import GreenApiConnection from "../GreenApiConnection";

export default async function GreenApiPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Double check admin status (though the component also handles this gracefully)
  if ((user.role as string) !== "admin" && (user.role as string) !== "super") {
    // We allow them to see the page but the component will show a "Locked" state
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <GreenApiConnection />
    </div>
  );
}
