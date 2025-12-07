import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 bg-linear-to-br from-indigo-50 to-blue-50">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl backdrop-blur-sm/70 border border-white/20">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            התחבר לחשבון שלך
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            גישה מאובטחת למערכת הניהול
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
