import { getAnalyticsData } from "@/app/actions/analytics";
import { getViewFolders } from "@/app/actions/view-folders";
import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { isRateLimitError, throwIfAnyRateLimited } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewAnalytics")) {
    redirect("/");
  }

  let analyticsData, foldersData, refreshUsageData;
  try {
    [analyticsData, foldersData, refreshUsageData] = await Promise.all([
      getAnalyticsData(),
      getViewFolders(),
      getAnalyticsRefreshUsage(),
    ]);
    throwIfAnyRateLimited(analyticsData, foldersData, refreshUsageData);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  const updatedViews = (analyticsData.success && 'data' in analyticsData) ? analyticsData.data : [];
  const updatedFolders = (foldersData.success && 'data' in foldersData) ? foldersData.data ?? [] : [];
  const loadError = !analyticsData.success
    ? ((analyticsData as any).error || "Failed to load")
    : null;
  const refreshUsage: { usage: number; nextResetTime: string | null } = refreshUsageData.success
    ? { usage: refreshUsageData.usage, nextResetTime: ('nextResetTime' in refreshUsageData ? refreshUsageData.nextResetTime : null) ?? null }
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
      loadError={loadError}
    />
  );
}
