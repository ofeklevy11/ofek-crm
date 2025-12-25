import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions-server";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8 bg-linear-to-br from-primary/5 to-secondary/20"
      dir="rtl"
    >
      <div className="max-w-md w-full space-y-8 bg-card p-10 rounded-2xl shadow-xl border border-border">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-card-foreground tracking-tight">
            הרשמה למערכת
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            צור חשבון חדש והתחל לנהל את הארגון שלך
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
