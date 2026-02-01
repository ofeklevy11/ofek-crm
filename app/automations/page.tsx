import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { getAutomationRules } from "@/app/actions/automations";
import { getUsers } from "@/app/actions/users";
import { redirect } from "next/navigation";
import AutomationsList from "@/components/AutomationsList";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!hasUserFlag(user, "canViewAutomations")) {
    redirect("/");
  }

  const [rulesResponse, usersResponse, tables, foldersResponse] =
    await Promise.all([
      getAutomationRules(),
      getUsers(),
      // CRITICAL: Filter by companyId for multi-tenancy security
      prisma.tableMeta.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, schemaJson: true },
        orderBy: { name: "asc" },
      }),
      import("@/app/actions/folders").then((mod) =>
        mod.getFolders("AUTOMATION"),
      ),
    ]);

  const rules = rulesResponse.success ? rulesResponse.data : [];
  const users = usersResponse.success ? usersResponse.data : [];
  const folders = foldersResponse.success ? foldersResponse.data : [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="md:flex md:items-center md:justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            ניהול אוטומציות
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            צור ונהל כללים אוטומטיים לשליחת התראות וביצוע פעולות במערכת.
          </p>
        </div>
      </div>

      {/* Disclaimer for time-based automations */}
      <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <svg
          className="w-5 h-5 text-blue-600 mt-0.5 shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">
            הערה חשובה לגבי אוטומציות מבוססות זמן
          </h3>
          <p className="text-sm text-blue-800">
            על מנת להפעיל אוטומציות מסוג &quot;זמן לאחר יצירה&quot;, יש צורך
            להגדיר Cron Jobs דרך Vercel. האוטומציות יבדקו ויופעלו בהתאם לתזמון
            שהוגדר.
          </p>
        </div>
      </div>

      <AutomationsList
        initialRules={rules as any[]}
        users={users as any[]}
        tables={tables}
        folders={folders}
        currentUserId={user.id}
        userPlan={user.isPremium || "basic"}
      />
    </div>
  );
}
