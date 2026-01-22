import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { getDashboardInitialData } from "@/app/actions/dashboard";
import DashboardClient from "@/components/DashboardClient";
import { ArrowLeft, CheckCircle2, LayoutDashboard, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div
        className="min-h-screen bg-[#f4f8f8] flex flex-col items-center justify-center p-4"
        dir="rtl"
      >
        <div className="max-w-5xl w-full grid md:grid-cols-2 gap-0 bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
          {/* Right Side - Content */}
          <div className="p-10 md:p-14 flex flex-col justify-center space-y-8 order-2 md:order-1">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-[#4f95ff] rounded-full text-sm font-semibold w-fit">
                <Zap className="w-4 h-4" />
                <span>מערכת CRM חכמה לניהול העסק</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                הפתרון המושלם
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4f95ff] to-[#a24ec1]">
                  לניהול העסק שלך
                </span>
              </h1>

              <p className="text-gray-500 text-lg leading-relaxed max-w-md">
                מערכת CRM מתקדמת המאפשרת לך לנהל לידים, לקוחות, מכירות ומשימות
                במקום אחד - פשוט, חכם ויעיל.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/login"
                prefetch={false}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#4f95ff] to-[#a24ec1] text-white py-4 px-8 rounded-xl hover:opacity-90 transition-all font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <span>כניסה למערכת</span>
                <ArrowLeft className="w-5 h-5" />
              </Link>

              <Link
                href="/register"
                prefetch={false}
                className="flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 py-4 px-8 rounded-xl hover:bg-gray-50 transition-all font-semibold text-lg"
              >
                <span>הרשמה</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-gray-500 pt-6 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#4f95ff]" />
                <span>ניהול לידים ולקוחות</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#a24ec1]" />
                <span>אוטומציות חכמות</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#4f95ff]" />
                <span>דוחות ונתונים</span>
              </div>
            </div>
          </div>

          {/* Left Side - Visual */}
          <div className="hidden md:flex flex-col items-center justify-center bg-gradient-to-br from-blue-50/50 to-purple-50/50 p-12 relative overflow-hidden order-1 md:order-2 border-l border-gray-100">
            <div className="absolute inset-0 bg-[radial-gradient(#4f95ff_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.05]"></div>

            <div className="relative z-10 w-full max-w-sm">
              {/* Abstract Card visuals */}
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-gradient-to-br from-[#4f95ff] to-[#a24ec1] rounded-2xl opacity-10 animate-pulse"></div>

              <div className="bg-white p-6 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-50 backdrop-blur-sm relative z-20 transform hover:scale-[1.02] transition-transform duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#4f95ff]">
                      <LayoutDashboard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">סקירה יומית</div>
                      <div className="text-xs text-gray-400">היום, 8 ינואר</div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    +12%
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-600">
                      לידים חדשים
                    </span>
                    <span className="font-bold text-gray-900">24</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-600">
                      מכירות
                    </span>
                    <span className="font-bold text-gray-900">₪4,200</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#4f95ff] to-[#a24ec1] w-2/3 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-lg border border-gray-50 z-30 animate-bounce [animation-duration:3s]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-semibold text-gray-700">
                    משימה הושלמה
                  </span>
                </div>
              </div>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl -z-10"></div>
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
