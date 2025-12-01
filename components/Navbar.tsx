import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import UserMenu from "./UserMenu";

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-blue-600">
                CRM
              </Link>
            </div>
            <div className="hidden sm:ms-6 sm:flex sm:space-x-8 sm:space-x-reverse">
              <Link
                href="/tables"
                className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Tables
              </Link>
              <Link
                href="/tables/new"
                className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                New Table
              </Link>
              <Link
                href="/tasks"
                className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Tasks
              </Link>
              <Link
                href="/calendar"
                className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Calendar
              </Link>
              {user?.role === "admin" && (
                <Link
                  href="/users"
                  className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Users
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center">
            <UserMenu user={user} />
          </div>
        </div>
      </div>
    </nav>
  );
}
