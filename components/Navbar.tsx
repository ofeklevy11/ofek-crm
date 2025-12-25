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
                CRM למנהל
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-6 space-x-reverse overflow-x-auto scrollbar-hide">
              <Link href="/" className={linkClass}>
                לוח בקרה
              </Link>
              {user && (
                <>
                  <Link href="/tables" className={linkClass}>
                    טבלאות
                  </Link>
                  {user.role === "admin" && (
                    <>
                      <Link href="/finance" className={linkClass}>
                        כספים
                      </Link>
                      <Link href="/calendar" className={linkClass}>
                        יומן
                      </Link>
                    </>
                  )}
                  <Link href="/tasks" className={linkClass}>
                    משימות
                  </Link>
                  <Link href="/nurture-hub" className={linkClass}>
                    טיפוח לקוחות
                  </Link>
                  {hasUserFlag(user, "canViewAutomations") && (
                    <Link href="/automations" className={linkClass}>
                      אוטומציות
                    </Link>
                  )}
                  <Link href="/workflows" className={linkClass}>
                    תהליכים
                  </Link>
                  {user.role === "admin" && (
                    <Link href="/users" className={linkClass}>
                      משתמשים
                    </Link>
                  )}
                  {user.role === "admin" && (
                    <Link href="/workers" className={linkClass}>
                      עובדים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAnalytics") && (
                    <Link href="/analytics" className={linkClass}>
                      אנליטיקה
                    </Link>
                  )}
                  <Link href="/services" className={linkClass}>
                    שירותים
                  </Link>
                  <Link href="/quotes" className={linkClass}>
                    הצעות מחיר
                  </Link>
                  <Link href="/service" className={linkClass}>
                    קריאות שירות
                  </Link>
                  <Link href="/files" className={linkClass}>
                    קבצים
                  </Link>
                  <ChatNavbarLink />
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
