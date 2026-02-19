"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUnreadConversationCount } from "@/app/actions/whatsapp";
import { useRealtime } from "@/hooks/use-realtime";

interface WhatsAppNavbarLinkProps {
  userId: number;
}

export default function WhatsAppNavbarLink({
  userId,
}: WhatsAppNavbarLinkProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const isActive = pathname?.startsWith("/whatsapp");

  const fetchUnread = useCallback(async () => {
    try {
      const count = await getUnreadConversationCount();
      setUnreadCount(count);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Listen for real-time WhatsApp events to update badge
  const handleRealtimeMessage = useCallback(
    (msg: { channel: string; data: any }) => {
      if (!msg.channel.endsWith(":whatsapp")) return;
      if (msg.data?.type === "wa-new-message" && msg.data?.direction === "INBOUND") {
        // Don't increment if user is already on WhatsApp page viewing that conversation
        if (!isActive) {
          setUnreadCount((prev) => prev + 1);
        } else {
          fetchUnread();
        }
      }
    },
    [isActive, fetchUnread],
  );

  useRealtime(userId, handleRealtimeMessage, {
    onReconnect: fetchUnread,
  });

  // Refresh count when navigating to/from whatsapp
  useEffect(() => {
    if (isActive) {
      fetchUnread();
    }
  }, [isActive, fetchUnread]);

  return (
    <Link
      href="/whatsapp"
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-green-100 text-green-800"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {/* WhatsApp icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      <span>וואטסאפ</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold px-1">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
