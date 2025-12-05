"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { getNotifications, markAsRead } from "@/app/actions/notifications";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Notification {
  id: number;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

interface NotificationBellProps {
  userId: number;
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const response = await getNotifications(userId);
      if (response.success && response.data) {
        setNotifications(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
    }
    setIsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-full"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50 max-h-96 overflow-y-auto">
          <div className="py-2">
            <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                Notifications
              </h3>
            </div>

            {loading ? (
              <div className="px-4 py-4 text-center text-sm text-gray-500">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-gray-500">
                No notifications
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition-colors duration-150 relative group ${
                      !notification.read ? "bg-blue-50" : ""
                    }`}
                  >
                    <div
                      className="cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={`text-sm font-medium ${
                            !notification.read
                              ? "text-gray-900"
                              : "text-gray-700"
                          }`}
                        >
                          {notification.title}
                        </span>
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick({
                                ...notification,
                                link: null,
                              }); // Hack to just mark as read without navigating
                            }}
                            className="text-gray-400 hover:text-green-600 p-0.5 rounded-full hover:bg-green-50"
                            title="סמן כנקרא"
                          >
                            <Bell className="h-3 w-3 fill-current" />
                          </button>
                        )}
                      </div>
                      {notification.message && (
                        <span className="text-xs text-gray-500 mt-1 line-clamp-2 block">
                          {notification.message}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 mt-1 block">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-100 bg-gray-50 p-2 text-center">
            <Link
              href="/notifications"
              className="text-xs font-medium text-blue-600 hover:text-blue-500"
              onClick={() => setIsOpen(false)}
            >
              צפה בכל ההתראות
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
