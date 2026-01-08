import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { getDashboardInitialData } from "@/app/actions/dashboard";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/80 backdrop-blur-sm shadow-2xl rounded-3xl p-12 text-center border border-gray-100">
          <div className="mb-8">
            <h1 className="text-5xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
              Simple CRM
            </h1>
            <p className="text-gray-700 text-lg">
              Manage your custom tables and records with ease
            </p>
          </div>

          <div className="space-y-4">
            <Link
              href="/login"
              className="block w-full bg-linear-to-r from-indigo-600 to-purple-600 text-white py-4 px-6 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Sign In to Get Started →
            </Link>

            <p className="text-sm text-gray-500 pt-4">
              Create dynamic tables, manage records, and export your data
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch Dashboard Data
  const { analyticsViews, tables, goals } = await getDashboardInitialData();

  return (
    <div className="min-h-screen bg-muted/40 p-8" dir="rtl">
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
