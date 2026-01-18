"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUnreadCounts } from "@/app/actions/chat";
import { useRealtime } from "@/hooks/use-realtime";

interface ChatNavbarLinkProps {
  userId: number;
}

export default function ChatNavbarLink({ userId }: ChatNavbarLinkProps) {
  const [totalUnread, setTotalUnread] = useState(0);

  /* REMOVED POLLING IN FAVOR OF SSE
  useEffect(() => {
    // ... polling logic ...
  }, []); 
  */

  const fetchUnread = async () => {
    try {
      const counts = await getUnreadCounts();
      const total = counts.reduce((acc, curr) => acc + curr.count, 0);
      setTotalUnread(total);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUnread();
  }, []);

  // You might need to get userId from context or props to use real-time
  // Assuming we can get it or this component is wrapped.
  // For now let's assume we fetch it or the hook handles null gracefully until layout provides it?
  // Actually, we need the current user ID for the channel subscription.
  // Ideally passed as prop or from a session hook.
  // Let's add a placeholder comment or try to fetch it?
  // Optimization: ChatNavbarLink usually sits in a layout where user data is known.
  // But wait, the previous code didn't have userId. It called server action `getUnreadCounts` which uses `getCurrentUser`.
  // To use SSE client-side, we NEED the userId.
  // I will assume for this step we might need to fetch `me` first or receive it as prop.
  // Let's modify the component to accept userId as prop or fetch it.

  // Realtime Subscription
  useRealtime(userId, (msg) => {
    if (
      msg.channel === `user:${userId}:chat` &&
      msg.data.type === "new-message"
    ) {
      // Ideally we check if it's from someone else or we just increment.
      // Simpler: just re-fetch unread counts to be accurate (server source of truth)
      // Or optimistically increment.
      // Let's re-fetch for accuracy as it's fast and reliable.
      fetchUnread();
    }
  });

  return (
    <Link
      href="/chat"
      className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#4f95ff]/10 to-blue-400/10 hover:from-[#4f95ff]/20 hover:to-blue-400/20 text-[#4f95ff] text-sm font-medium border border-[#4f95ff]/20 transition-all whitespace-nowrap shadow-sm hover:shadow-md flex items-center gap-2"
    >
      Chat
      {totalUnread > 0 && (
        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      )}
    </Link>
  );
}
