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

  const [rulesResponse, usersResponse, tables] = await Promise.all([
    getAutomationRules(),
    getUsers(),
    prisma.tableMeta.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rules = rulesResponse.success ? rulesResponse.data : [];
  const users = usersResponse.success ? usersResponse.data : [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            ניהול אוטומציות
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            צור ונהל כללים אוטומטיים לשליחת התראות וביצוע פעולות במערכת.
          </p>
        </div>
      </div>

      <AutomationsList
        initialRules={rules as any[]}
        users={users as any[]}
        tables={tables}
        currentUserId={user.id}
      />
    </div>
  );
}
