"use client";

import { useState } from "react";
import { markAsRead } from "@/app/actions/notifications";
import Link from "next/link";
import { Check } from "lucide-react";

interface Notification {
  id: number;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

interface NotificationsListProps {
  initialNotifications: Notification[];
}

export default function NotificationsList({
  initialNotifications,
}: NotificationsListProps) {
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);

  const handleMarkAsRead = async (id: number) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    const result = await markAsRead(id);
    if (!result.success) {
      // Revert if failed (optional, but good practice)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n))
      );
      console.error("Failed to mark as read");
    }
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      {notifications.length > 0 ? (
        <ul className="divide-y divide-gray-200">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <div
                className={`block ${
                  !notification.read ? "bg-blue-50" : "bg-white"
                }`}
              >
                <div className="px-4 py-4 sm:px-6 relative group">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-blue-600 truncate">
                      {notification.title}
                    </p>
                    <div className="ml-2 shrink-0 flex items-center gap-2">
                      {!notification.read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="text-gray-400 hover:text-green-600 transition-colors p-1"
                          title="סמן כנקרא"
                        >
                          <Check size={18} />
                        </button>
                      )}
                      <p
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          notification.read
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {notification.read ? "נקרא" : "חדש"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        {notification.message}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <p suppressHydrationWarning>
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {notification.link && (
                    <div className="mt-2">
                      <Link
                        href={notification.link}
                        className="text-sm text-blue-500 hover:text-blue-700"
                      >
                        מעבר לקישור
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">אין התראות להצגה</p>
        </div>
      )}
    </div>
  );
}
