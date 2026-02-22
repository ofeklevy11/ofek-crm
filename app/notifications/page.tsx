import { getCurrentUser } from "@/lib/permissions-server";
import { getNotifications } from "@/app/actions/notifications";
import { redirect } from "next/navigation";
import NotificationsList from "@/components/NotificationsList";
import { isRateLimitError, throwIfAnyRateLimited } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  let response;
  try {
    response = await getNotifications(null);
    throwIfAnyRateLimited(response);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

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
