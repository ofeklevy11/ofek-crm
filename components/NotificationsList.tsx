"use client";

import { useState } from "react";
import {
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteNotifications,
} from "@/app/actions/notifications";
import Link from "next/link";
import { Check, Trash2, CheckCircle, Wallet } from "lucide-react";
import { showConfirm } from "@/hooks/use-modal";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if all are selected
  const allSelected =
    notifications.length > 0 && selectedIds.length === notifications.length;

  const handleMarkAsRead = async (id: number) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );

    const result = await markAsRead(id);
    if (!result.success) {
      // Revert if failed
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      );
      if (isRateLimitError(result)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(result.error));
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsProcessing(true);
    // Optimistic update
    const previousState = [...notifications];
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    const result = await markAllAsRead();
    if (!result.success) {
      setNotifications(previousState);
      if (isRateLimitError(result)) toast.error(RATE_LIMIT_MESSAGE, { id: "notifications-bulk" });
      else toast.error(getUserFriendlyError(result.error), { id: "notifications-bulk" });
    }
    setIsProcessing(false);
  };

  const handleDelete = async (id: number) => {
    if (!(await showConfirm("האם אתה בטוח שברצונך למחוק התראה זו?"))) return;

    // Optimistic update
    const previousState = [...notifications];
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setSelectedIds((prev) => prev.filter((pid) => pid !== id));

    const result = await deleteNotification(id);
    if (!result.success) {
      setNotifications(previousState);
      if (isRateLimitError(result)) toast.error(RATE_LIMIT_MESSAGE);
      else toast.error(getUserFriendlyError(result.error));
    }
  };

  const handleDeleteSelected = async () => {
    if (!(await showConfirm(`האם אתה בטוח שברצונך למחוק ${selectedIds.length} התראות?`)))
      return;

    setIsProcessing(true);
    // Optimistic update
    const previousState = [...notifications];
    setNotifications((prev) => prev.filter((n) => !selectedIds.includes(n.id)));

    // Clear selection
    const idsToDelete = [...selectedIds];
    setSelectedIds([]);

    const result = await deleteNotifications(idsToDelete);
    if (!result.success) {
      setNotifications(previousState);
      setSelectedIds(idsToDelete); // Restore selection
      if (isRateLimitError(result)) toast.error(RATE_LIMIT_MESSAGE, { id: "notifications-bulk" });
      else toast.error(getUserFriendlyError(result.error), { id: "notifications-bulk" });
    }
    setIsProcessing(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notifications.map((n) => n.id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 shadow sm:rounded-md gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={notifications.length === 0}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span>בחר הכל</span>
          </label>

          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isProcessing}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
            >
              <Trash2 size={16} />
              <span>מחק נבחרים ({selectedIds.length})</span>
            </button>
          )}
        </div>

        <button
          onClick={handleMarkAllAsRead}
          disabled={
            isProcessing ||
            notifications.every((n) => n.read) ||
            notifications.length === 0
          }
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle size={16} />
          <span>סמן הכל כנקרא</span>
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {notifications.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={
                  selectedIds.includes(notification.id) ? "bg-blue-50" : ""
                }
              >
                <div
                  className={`block transition-colors duration-200 ${
                    !notification.read ? "bg-blue-50/50" : "bg-white"
                  } hover:bg-gray-50`}
                >
                  <div className="px-4 py-4 sm:px-6 relative group flex items-start gap-4">
                    {/* Checkbox */}
                    <div className="shrink-0 pt-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(notification.id)}
                        onChange={() => toggleSelect(notification.id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-blue-600 truncate">
                          {notification.title}
                        </p>

                        {/* Status & Actions */}
                        <div className="ml-2 shrink-0 flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {/* Individual Delete Button (Trash) */}
                            <button
                              onClick={() => handleDelete(notification.id)}
                              className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-red-50"
                              title="מחק התראה"
                            >
                              <Trash2 size={16} />
                            </button>

                            {!notification.read && (
                              <button
                                onClick={() =>
                                  handleMarkAsRead(notification.id)
                                }
                                className="text-gray-400 hover:text-green-600 transition-colors p-1 rounded-full hover:bg-green-50"
                                title="סמן כנקרא"
                              >
                                <Check size={18} />
                              </button>
                            )}

                            <span
                              className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                notification.read
                                  ? "bg-gray-100 text-gray-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {notification.read ? "נקרא" : "חדש"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-1">
                        <p className="text-sm text-gray-600 whitespace-pre-line">
                          {notification.message}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          <p suppressHydrationWarning>
                            {new Date(notification.createdAt).toLocaleString(
                              "he-IL",
                            )}
                          </p>
                        </div>

                        {notification.link && (
                          <Link
                            href={notification.link}
                            prefetch={false}
                            className="text-sm text-blue-500 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                          >
                            מעבר לקישור
                          </Link>
                        )}
                      </div>
                    </div>
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
    </div>
  );
}
