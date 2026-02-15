import { getAnalyticsData } from "@/app/actions/analytics";
import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import GraphsDashboard from "@/components/analytics/GraphsDashboard";

export default async function GraphsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewAnalytics")) {
    redirect("/");
  }

  const [analyticsData, refreshUsageData] = await Promise.all([
    getAnalyticsData(),
    getAnalyticsRefreshUsage(),
  ]);

  const graphViews = analyticsData.success
    ? (analyticsData.data || []).filter((v: any) => v.type === "GRAPH")
    : [];

  const refreshUsage = refreshUsageData.success
    ? refreshUsageData
    : { usage: 0, nextResetTime: null };

  return (
    <GraphsDashboard
      initialViews={graphViews}
      initialRefreshUsage={refreshUsage}
      userPlan={user.isPremium || "basic"}
    />
  );
}
