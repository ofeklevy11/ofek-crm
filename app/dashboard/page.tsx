import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { getDashboardInitialData } from "@/app/actions/dashboard";
import DashboardClient from "@/components/DashboardClient";
import { checkActionRateLimit, DASHBOARD_RATE_LIMITS } from "@/lib/rate-limit-action";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Rate limit page SSR renders to prevent flooding
  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.page);
  if (rl) {
    return <RateLimitFallback />;
  }

  // Fetch Dashboard Data only if user has permission
  const canView = hasUserFlag(user, "canViewDashboardData");
  let analyticsViews: any[] = [], tables: any[] = [], goals: any[] = [];
  if (canView) {
    try {
      const data = await getDashboardInitialData();
      analyticsViews = data.analyticsViews;
      tables = data.tables;
      goals = data.goals;
    } catch (e) {
      if (isRateLimitError(e)) return <RateLimitFallback />;
      throw e;
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            לוח בקרה
          </h1>
          <p className="text-muted-foreground">סקירה כללית של העסק שלך</p>
        </div>

        <DashboardClient
          initialAnalytics={analyticsViews}
          availableTables={tables}
          availableGoals={goals}
          user={user}
        />
      </div>
    </div>
  );
}
