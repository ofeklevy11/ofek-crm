"use client";

import { useState, useEffect } from "react";
import { useRealtime } from "@/hooks/use-realtime";
import { Bell } from "lucide-react";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "@/app/actions/notifications";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

  /* POLLING REMOVED
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [userId]);
  */

  // Initial Fetch
  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  // Realtime Subscription
  const { isConnected } = useRealtime(userId, (msg) => {
    if (msg.channel === `user:${userId}:notifications`) {
      // Add new notification to state
      setNotifications((prev) => [msg.data, ...prev]);
    }
  });

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
    }
    setIsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllAsRead();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground rounded-full h-8 w-8 lg:h-9 lg:w-9"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-0" align="end" forceMount>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
          <h3 className="font-semibold text-sm">התראות</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-xs text-primary hover:underline hover:text-primary/80 transition-colors"
            >
              סמן הכל כנקרא
            </button>
          )}
          <Link
            href="/notifications"
            className="text-xs text-primary hover:underline hover:text-primary/80 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            צפה בכולן
          </Link>
        </div>
        <ScrollArea className="h-[300px]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              טוען...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              אין התראות חדשות
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "relative px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group",
                    !notification.read && "bg-primary/5",
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium leading-none",
                        !notification.read
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {notification.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(notification.createdAt).toLocaleTimeString(
                        "he-IL",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                  </div>
                  {notification.message && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                  )}

                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationClick({
                          ...notification,
                          link: null,
                        });
                      }}
                      title="סמן כנקרא"
                    >
                      <span className="sr-only">סמן כנקרא</span>
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
