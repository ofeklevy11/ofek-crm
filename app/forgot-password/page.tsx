import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "איפוס סיסמה",
  description: "איפוס סיסמה לחשבון שלך",
};

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden"
      dir="rtl"
    >
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-secondary/5 blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-card p-8 sm:p-10 rounded-2xl shadow-xl border border-border/50 backdrop-blur-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent inline-block tracking-tight">
              איפוס סיסמה
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              הזן את כתובת האימייל שלך ונשלח לך קוד לאיפוס הסיסמה
            </p>
          </div>

          <ForgotPasswordForm />
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground/50">
          BizlyCRM &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
