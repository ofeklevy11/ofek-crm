"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import ConversationItem from "./ConversationItem";

interface Conversation {
  id: number;
  status: string;
  unreadCount: number;
  lastMessageAt: Date | string | null;
  lastMessagePreview: string | null;
  contact: {
    id: number;
    waId: string;
    profileName: string | null;
    phone: string | null;
  };
  phoneNumber: {
    displayPhone: string;
    verifiedName: string | null;
  };
  assignedUser: { id: number; name: string } | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (conversation: Conversation) => void;
  currentUserId: number;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  currentUserId,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned">("all");

  const filtered = useMemo(() => {
    let result = conversations;

    // Filter
    if (filter === "mine") {
      result = result.filter((c) => c.assignedUser?.id === currentUserId);
    } else if (filter === "unassigned") {
      result = result.filter((c) => !c.assignedUser);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.contact.profileName?.toLowerCase().includes(q) ||
          c.contact.phone?.includes(q) ||
          c.contact.waId.includes(q),
      );
    }

    return result;
  }, [conversations, filter, searchQuery, currentUserId]);

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          וואטסאפ עסקי
        </h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חפש שיחות..."
            className="w-full pr-9 pl-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {(
            [
              ["all", "הכל"],
              ["mine", "שלי"],
              ["unassigned", "ללא שיוך"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === key
                  ? "bg-green-100 text-green-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            {searchQuery ? "לא נמצאו תוצאות" : "אין שיחות"}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              id={conv.id}
              contactName={conv.contact.profileName}
              contactPhone={conv.contact.phone || conv.contact.waId}
              lastMessage={conv.lastMessagePreview}
              lastMessageAt={conv.lastMessageAt}
              unreadCount={conv.unreadCount}
              isSelected={conv.id === selectedId}
              assignedUserName={conv.assignedUser?.name}
              onClick={() => onSelect(conv)}
            />
          ))
        )}
      </div>
    </div>
  );
}
