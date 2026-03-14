import { Calendar } from "@/components/Calendar/Calendar";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "יומן | BizlyCRM" };

export default async function CalendarPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <main aria-label="יומן" className="min-h-screen">
      <Calendar />
    </main>
  );
}
