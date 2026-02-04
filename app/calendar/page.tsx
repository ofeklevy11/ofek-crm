import { Calendar } from "@/components/Calendar/Calendar";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function CalendarPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <Calendar />
    </div>
  );
}
