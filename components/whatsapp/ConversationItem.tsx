"use client";

interface ConversationItemProps {
  id: number;
  contactName: string | null;
  contactPhone: string;
  lastMessage: string | null;
  lastMessageAt: Date | string | null;
  unreadCount: number;
  isSelected: boolean;
  assignedUserName?: string | null;
  onClick: () => void;
}

export default function ConversationItem({
  contactName,
  contactPhone,
  lastMessage,
  lastMessageAt,
  unreadCount,
  isSelected,
  assignedUserName,
  onClick,
}: ConversationItemProps) {
  const time = lastMessageAt
    ? formatRelativeTime(new Date(lastMessageAt))
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-right px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        isSelected ? "bg-green-50 border-r-2 border-r-green-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Avatar circle */}
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-green-700 font-semibold text-sm">
                {(contactName || contactPhone)?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">
                {contactName || contactPhone}
              </p>
              {contactName && (
                <p className="text-xs text-gray-400 font-mono">
                  {contactPhone}
                </p>
              )}
            </div>
          </div>
          {lastMessage && (
            <p className="text-xs text-gray-500 truncate mt-1 mr-12">
              {lastMessage}
            </p>
          )}
          {assignedUserName && (
            <p className="text-[10px] text-gray-400 mt-0.5 mr-12">
              {assignedUserName}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[10px] text-gray-400">{time}</span>
          {unreadCount > 0 && (
            <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) {
    return date.toLocaleDateString("he-IL", { weekday: "short" });
  }
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
  });
}
