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
      className="border-transparent text-black hover:border-gray-300 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium relative"
    >
      Chat
      {totalUnread > 0 && (
        <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      )}
    </Link>
  );
}
