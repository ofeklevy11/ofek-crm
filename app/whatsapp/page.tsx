import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import WhatsAppChatInterface from "@/components/whatsapp/WhatsAppChatInterface";

export const metadata = {
  title: "וואטסאפ עסקי",
  description: "צ׳אט וואטסאפ עסקי לתקשורת עם לקוחות",
};

export default async function WhatsAppPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
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
