import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import WhatsAppChatInterface from "@/components/whatsapp/WhatsAppChatInterface";
import { getWhatsAppConnectionStatus } from "@/app/actions/whatsapp-admin";
import { MessageSquareOff } from "lucide-react";

export const metadata = {
  title: "וואטסאפ עסקי",
  description: "צ׳אט וואטסאפ עסקי לתקשורת עם לקוחות",
};

export default async function WhatsAppPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const status = await getWhatsAppConnectionStatus();

  if (!status.connected) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center" dir="rtl">
          <div className="p-4 bg-slate-100 rounded-full mb-6">
            <MessageSquareOff className="w-16 h-16 text-slate-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            WhatsApp Business לא מחובר
          </h2>
          <p className="text-slate-500 mb-6 max-w-md">
            כדי להשתמש בצ׳אט וואטסאפ עסקי, יש לחבר תחילה את חשבון ה-WhatsApp Business דרך Meta.
          </p>
          <Link
            href="/profile/whatsapp"
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
          >
            חיבור WhatsApp Business
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <h1 className="sr-only">וואטסאפ עסקי</h1>
      <WhatsAppChatInterface
        currentUser={{
          id: user.id,
          name: user.name,
          companyId: user.companyId,
          role: user.role,
        }}
      />
    </div>
  );
}
