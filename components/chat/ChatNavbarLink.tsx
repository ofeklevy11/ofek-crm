"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUnreadCounts } from "@/app/actions/chat";

export default function ChatNavbarLink() {
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const counts = await getUnreadCounts();
        // Calculate total unread considering each item logic in getUnreadCounts returns individual counts
        const total = counts.reduce((acc, curr) => acc + curr.count, 0);
        setTotalUnread(total);
      } catch (err) {
        console.error(err);
      }
    };

    fetchUnread();

    const interval = setInterval(fetchUnread, 10000); // Poll every 10s is enough for navbar
    return () => clearInterval(interval);
  }, []);

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
