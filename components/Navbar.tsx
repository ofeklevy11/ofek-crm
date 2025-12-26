import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import UserMenu from "./UserMenu";
import ChatNavbarLink from "./chat/ChatNavbarLink";
import NotificationBell from "./NotificationBell";

export default async function Navbar() {
  const user = await getCurrentUser();

  const linkClass =
    "text-sm font-medium transition-colors hover:text-primary text-muted-foreground whitespace-nowrap";
  const activeLinkClass = "text-sm font-medium text-primary whitespace-nowrap"; // You can add logic for active state later

  return (
    <nav className="bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border/40 sticky top-0 z-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center flex-1 min-w-0 gap-8">
            <div className="shrink-0 flex items-center">
              <Link
                href="/"
                className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent"
              >
                {user?.company?.name || "CRM למנהל"}
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-6 space-x-reverse overflow-x-auto scrollbar-hide">
              <Link href="/" className={linkClass}>
                לוח בקרה
              </Link>
              {user && (
                <>
                  {hasUserFlag(user, "canViewTables") && (
                    <Link href="/tables" className={linkClass}>
                      טבלאות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewFinance") && (
                    <Link href="/finance" className={linkClass}>
                      כספים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewCalendar") && (
                    <Link href="/calendar" className={linkClass}>
                      יומן
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewTasks") && (
                    <Link href="/tasks" className={linkClass}>
                      משימות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewNurtureHub") && (
                    <Link href="/nurture-hub" className={linkClass}>
                      טיפוח לקוחות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAutomations") && (
                    <Link href="/automations" className={linkClass}>
                      אוטומציות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewWorkflows") && (
                    <Link href="/workflows" className={linkClass}>
                      תהליכים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewUsers") && (
                    <Link href="/users" className={linkClass}>
                      משתמשים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewWorkers") && (
                    <Link href="/workers" className={linkClass}>
                      עובדים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAnalytics") && (
                    <Link href="/analytics" className={linkClass}>
                      אנליטיקה
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewServices") && (
                    <Link href="/services" className={linkClass}>
                      שירותים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewQuotes") && (
                    <Link href="/quotes" className={linkClass}>
                      הצעות מחיר
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewServiceCalls") && (
                    <Link href="/service" className={linkClass}>
                      קריאות שירות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewFiles") && (
                    <Link href="/files" className={linkClass}>
                      קבצים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewChat") && <ChatNavbarLink />}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <NotificationBell userId={user.id} />
                <UserMenu user={user} />
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-primary"
              >
                התחבר
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
