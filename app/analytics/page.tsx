import { getAnalyticsData } from "@/app/actions/analytics";
import { getViewFolders } from "@/app/actions/view-folders";
import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewAnalytics")) {
    redirect("/");
  }

  const [analyticsData, foldersData, refreshUsageData] = await Promise.all([
    getAnalyticsData(),
    getViewFolders(),
    getAnalyticsRefreshUsage(),
  ]);

  const updatedViews = analyticsData.success ? analyticsData.data : [];
  const updatedFolders = foldersData.success ? foldersData.data : [];
  const refreshUsage = refreshUsageData.success
    ? refreshUsageData
    : { usage: 0, nextResetTime: null };

  return (
    <AnalyticsDashboard
      initialViews={updatedViews}
      initialFolders={updatedFolders}
      initialRefreshUsage={refreshUsage}
      currentUser={{
        id: user.id,
        canManage: hasUserFlag(user, "canManageAnalytics"),
        plan: user.isPremium || "basic",
      }}
    />
  );
}
