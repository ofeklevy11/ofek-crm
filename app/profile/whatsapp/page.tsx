import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import WhatsAppEmbeddedSignup from "@/components/whatsapp/WhatsAppEmbeddedSignup";

export default async function WhatsAppSettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <WhatsAppEmbeddedSignup />
    </div>
  );
}
