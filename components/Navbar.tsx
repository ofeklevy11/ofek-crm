import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import UserMenu from "./UserMenu";
import ChatNavbarLink from "./chat/ChatNavbarLink";
import NotificationBell from "./NotificationBell";

export default async function Navbar() {
  const user = await getCurrentUser();

  const linkClass =
    "border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-0.5 pt-1 border-b-2 text-xs font-medium whitespace-nowrap";

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-full mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex justify-between h-16">
          <div className="flex items-center flex-1 min-w-0">
            <div className="shrink-0 flex items-center">
              <Link href="/" className="text-lg font-bold text-indigo-600">
                CRM
              </Link>
            </div>
            <div className="hidden sm:ml-4 sm:flex sm:space-x-2 lg:space-x-4 overflow-x-auto scrollbar-hide">
              <Link href="/" className={linkClass}>
                Dashboard
              </Link>
              {user && (
                <>
                  <Link href="/tables" className={linkClass}>
                    Tables
                  </Link>
                  {user.role === "admin" && (
                    <>
                      <Link href="/finance" className={linkClass}>
                        Finance
                      </Link>
                      <Link href="/calendar" className={linkClass}>
                        Calendar
                      </Link>
                    </>
                  )}
                  <Link href="/tasks" className={linkClass}>
                    Tasks
                  </Link>
                  <Link href="/nurture-hub" className={linkClass}>
                    Nurture Hub
                  </Link>
                  {hasUserFlag(user, "canViewAutomations") && (
                    <Link href="/automations" className={linkClass}>
                      Automations
                    </Link>
                  )}
                  <Link href="/workflows" className={linkClass}>
                    Workflows
                  </Link>
                  {user.role === "admin" && (
                    <Link href="/users" className={linkClass}>
                      Users
                    </Link>
                  )}
                  {user.role === "admin" && (
                    <Link href="/workers" className={linkClass}>
                      Workers
                    </Link>
                  )}
                  {hasUserFlag(user, "canViewAnalytics") && (
                    <Link href="/analytics" className={linkClass}>
                      Analytics
                    </Link>
                  )}
                  <Link href="/services" className={linkClass}>
                    Services
                  </Link>
                  <Link href="/quotes" className={linkClass}>
                    Quotes
                  </Link>
                  <Link href="/service" className={linkClass}>
                    Service
                  </Link>
                  <Link href="/files" className={linkClass}>
                    Files
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
                className="text-gray-500 hover:text-gray-900 font-medium"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
