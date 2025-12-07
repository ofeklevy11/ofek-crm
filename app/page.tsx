import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white/80 backdrop-blur-sm shadow-2xl rounded-3xl p-12 text-center border border-gray-100">
        <div className="mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Simple CRM
          </h1>
          <p className="text-gray-700 text-lg">
            Manage your custom tables and records with ease
          </p>
        </div>

        <div className="space-y-4">
          {user ? (
            <>
              <Link
                href="/tables"
                className="block w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Go to Tables →
              </Link>

              <Link
                href="/calendar"
                className="block w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-4 px-6 rounded-xl hover:from-purple-700 hover:to-purple-800 transition font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Go to Calendar →
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="block w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-6 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Sign In to Get Started →
            </Link>
          )}

          <p className="text-sm text-gray-500 pt-4">
            Create dynamic tables, manage records, and export your data
          </p>
        </div>
      </div>
    </div>
  );
}
