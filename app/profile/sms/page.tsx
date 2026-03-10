import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import SmsIntegrationSettings from "@/components/sms/SmsIntegrationSettings";

export default async function SmsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <SmsIntegrationSettings />
    </div>
  );
}
