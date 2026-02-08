import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import UserMenu from "./UserMenu";
import ChatNavbarLink from "./chat/ChatNavbarLink";
import NotificationBell from "./NotificationBell";
import MobileMenu from "./MobileMenu";

export default async function Navbar() {
  const user = await getCurrentUser();

  const linkClass =
    "text-sm font-medium transition-colors hover:text-primary text-muted-foreground whitespace-nowrap";
  const activeLinkClass = "text-sm font-medium text-primary whitespace-nowrap"; // You can add logic for active state later

  return (
    <nav className="bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border/40 sticky top-0 z-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="shrink-0 flex items-center">
            <Link
              href="/"
              prefetch={false}
              className="text-base font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent whitespace-nowrap"
            >
              {(() => {
                const name = user?.company?.name || "CRM למנהל";
                return name.length > 16 ? `${name.slice(0, 16)}...` : name;
              })()}
            </Link>
          </div>

          <div className="hidden md:flex items-center justify-center flex-1 px-8">
            <div className="flex items-center space-x-6 space-x-reverse overflow-x-auto scrollbar-hide py-2">
              <Link href="/" prefetch={false} className={linkClass}>
                לוח בקרה
              </Link>
              {user && (
                <>
                  {hasUserFlag(user, "canViewTables") && (
                    <Link href="/tables" prefetch={false} className={linkClass}>
                      טבלאות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewFinance") && (
                    <Link
                      href="/finance"
                      prefetch={false}
                      className={linkClass}
                    >
                      כספים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewCalendar") && (
                    <Link
                      href="/calendar"
                      prefetch={false}
                      className={linkClass}
                    >
                      יומן
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewTasks") && (
                    <Link href="/tasks" prefetch={false} className={linkClass}>
                      משימות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewNurtureHub") && (
                    <Link
                      href="/nurture-hub"
                      prefetch={false}
                      className={linkClass}
                    >
                      טיפוח לקוחות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAutomations") && (
                    <Link
                      href="/automations"
                      prefetch={false}
                      className={linkClass}
                    >
                      אוטומציות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewWorkflows") && (
                    <Link
                      href="/workflows"
                      prefetch={false}
                      className={linkClass}
                    >
                      תהליכים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewUsers") && (
                    <Link href="/users" prefetch={false} className={linkClass}>
                      משתמשים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewWorkers") && (
                    <Link
                      href="/workers"
                      prefetch={false}
                      className={linkClass}
                    >
                      עובדים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAnalytics") && (
                    <Link
                      href="/analytics"
                      prefetch={false}
                      className={linkClass}
                    >
                      אנליטיקה
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewServices") && (
                    <Link
                      href="/services"
                      prefetch={false}
                      className={linkClass}
                    >
                      מוצרים ושירותים
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewQuotes") && (
                    <Link href="/quotes" prefetch={false} className={linkClass}>
                      הצעות מחיר
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewServiceCalls") && (
                    <Link
                      href="/service"
                      prefetch={false}
                      className={linkClass}
                    >
                      קריאות שירות
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewFiles") && (
                    <Link href="/files" prefetch={false} className={linkClass}>
                      קבצים
                    </Link>
                  )}
                  <div className="flex items-center gap-3">
                    {hasUserFlag(user, "canViewGuides") && (
                      <a
                        href="/guides"
                        className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#4f95ff]/10 to-[#a24ec1]/10 hover:from-[#4f95ff]/20 hover:to-[#a24ec1]/20 text-[#a24ec1] text-sm font-medium border border-[#a24ec1]/20 transition-all whitespace-nowrap shadow-sm hover:shadow-md"
                      >
                        מדריכים
                      </a>
                    )}
                    {hasUserFlag(user, "canViewFinance") && (
                      <a
                        href="/finance/goals"
                        className="px-4 py-1.5 rounded-full bg-[#22c55e]/10 hover:bg-[#22c55e]/20 text-[#22c55e] text-sm font-medium border border-[#22c55e]/20 transition-all whitespace-nowrap shadow-sm hover:shadow-md"
                      >
                        תכנון יעדים
                      </a>
                    )}
                    {hasUserFlag(user, "canViewChat") && (
                      <ChatNavbarLink userId={user.id} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {user ? (
              <>
                <NotificationBell userId={user.id} />
                <div className="hidden md:block">
                  <UserMenu user={user} />
                </div>
                <div className="md:hidden">
                  <MobileMenu user={user} />
                </div>
              </>
            ) : (
              <Link
                href="/login"
                prefetch={false}
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
