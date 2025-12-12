import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import UserMenu from "./UserMenu";
import ChatNavbarLink from "./chat/ChatNavbarLink";
import NotificationBell from "./NotificationBell";

export default async function Navbar() {
  const user = await getCurrentUser();

  const linkClass =
    "border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium";

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-indigo-600">
                CRM
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
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
