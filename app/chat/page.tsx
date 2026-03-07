import ChatInterface from "@/components/chat/ChatInterface";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "צ'אט ארגוני | BizlyCRM",
  description: "צ'אט פנימי לשיחה עם חברים בארגון",
};

export default async function ChatPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">צ'אט פנימי</h1>
        <p className="text-gray-600 mt-2">
          דבר עם חברי הצוות שלך בקלות ובמהירות
        </p>
      </div>

      <ChatInterface currentUser={user} />
    </div>
  );
}
