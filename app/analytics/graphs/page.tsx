import { getAnalyticsData } from "@/app/actions/analytics";
import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { redirect } from "next/navigation";
import GraphsDashboard from "@/components/analytics/GraphsDashboard";

export const metadata = { title: "תצוגת גרפים" };

export default async function GraphsPage() {
  const user = await getCurrentUser();
  if (!user || !hasUserFlag(user, "canViewAnalytics")) {
    redirect("/dashboard");
  }

  const [analyticsData, refreshUsageData] = await Promise.all([
    getAnalyticsData(),
    getAnalyticsRefreshUsage(),
  ]);

  const graphViews = (analyticsData.success && "data" in analyticsData)
    ? (analyticsData.data || []).filter((v: any) => v.type === "GRAPH")
    : [];

  const loadError = !analyticsData.success
    ? ((analyticsData as any).error || "Failed to load")
    : null;

  const refreshUsage = refreshUsageData.success
    ? { usage: refreshUsageData.usage, nextResetTime: refreshUsageData.nextResetTime ?? null }
    : { usage: 0, nextResetTime: null as string | null };

  return (
    <GraphsDashboard
      initialViews={graphViews}
      initialRefreshUsage={refreshUsage}
      userPlan={user.isPremium || "basic"}
      loadError={loadError}
    />
  );
}
