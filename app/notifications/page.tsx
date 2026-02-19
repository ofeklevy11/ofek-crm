import { getCurrentUser } from "@/lib/permissions-server";
import { getNotifications } from "@/app/actions/notifications";
import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationsList from "@/components/NotificationsList";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all notifications for the full page view
  const response = await getNotifications(null);
  const notifications = response.success ? response.data : [];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">התראות</h1>
      </div>

      <NotificationsList initialNotifications={notifications as any[]} />
    </div>
  );
}
