"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ConversationList from "./ConversationList";
import MessageView from "./MessageView";
import {
  getConversations,
  getCompanyUsers,
} from "@/app/actions/whatsapp";
import { useRealtime } from "@/hooks/use-realtime";
import { MessageSquare, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

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

interface WhatsAppChatInterfaceProps {
  currentUser: {
    id: number;
    name: string;
    companyId: number;
    role: string;
  };
}

export default function WhatsAppChatInterface({
  currentUser,
}: WhatsAppChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [companyUsers, setCompanyUsers] = useState<
    { id: number; name: string; role: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showMobileList, setShowMobileList] = useState(true);

  // Real-time message/status buffers for the selected conversation
  const [realtimeMessages, setRealtimeMessages] = useState<any[]>([]);
  const [realtimeStatusUpdates, setRealtimeStatusUpdates] = useState<
    { wamId: string; status: string }[]
  >([]);

  const selectedConvIdRef = useRef<number | null>(null);

  useEffect(() => {
    selectedConvIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation]);

  // Fetch conversations and users
  const fetchData = useCallback(async () => {
    try {
      const [convs, users] = await Promise.all([
        getConversations({ limit: 50 }),
        getCompanyUsers(),
      ]);
      setConversations(convs as Conversation[]);
      setCompanyUsers(users);
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle real-time SSE messages
  const handleRealtimeMessage = useCallback(
    (msg: { channel: string; data: any }) => {
      if (!msg.channel.endsWith(":whatsapp")) return;

      const data = msg.data;

      if (data.type === "wa-new-message") {
        // If this message is for the selected conversation, push to realtime buffer
        if (
          data.conversationId === selectedConvIdRef.current
        ) {
          setRealtimeMessages((prev) => [
            {
              id: data.messageId,
              direction: data.direction,
              type: data.messageType || "TEXT",
              body: data.body,
              status: data.status || "DELIVERED",
              timestamp: data.timestamp,
              mediaUrl: null,
              mediaMime: null,
              mediaFileName: null,
              latitude: null,
              longitude: null,
              locationName: null,
              locationAddress: null,
              sentByUser: null,
              wamId: data.wamId || null,
            },
            ...prev,
          ]);
        }

        // Update conversation list
        setConversations((prev) => {
          const updated = prev.map((c) => {
            if (c.id === data.conversationId) {
              return {
                ...c,
                lastMessageAt: data.timestamp,
                lastMessagePreview: data.body || `[${data.messageType}]`,
                unreadCount:
                  data.conversationId === selectedConvIdRef.current
                    ? 0
                    : c.unreadCount + (data.direction === "INBOUND" ? 1 : 0),
              };
            }
            return c;
          });
          // Re-sort by lastMessageAt
          return updated.sort((a, b) => {
            const aTime = a.lastMessageAt
              ? new Date(a.lastMessageAt).getTime()
              : 0;
            const bTime = b.lastMessageAt
              ? new Date(b.lastMessageAt).getTime()
              : 0;
            return bTime - aTime;
          });
        });
      }

      if (data.type === "wa-status-update") {
        if (
          data.conversationId === selectedConvIdRef.current
        ) {
          setRealtimeStatusUpdates((prev) => {
            // Replace existing entry for same wamId to prevent unbounded growth
            const filtered = prev.filter((u) => u.wamId !== data.wamId);
            return [...filtered, { wamId: data.wamId, status: data.status }];
          });
        }
      }
    },
    [],
  );

  const { hasGivenUp } = useRealtime(currentUser.id, handleRealtimeMessage, {
    onReconnect: fetchData,
  });

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setRealtimeMessages([]);
    setRealtimeStatusUpdates([]);
    setShowMobileList(false);
  };

  const handleConversationUpdate = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]" role="status" aria-label="טוען שיחות וואטסאפ">
        <span className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-xl shadow-sm border overflow-hidden">
      {hasGivenUp && (
        <div role="alert" className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          <WifiOff className="w-4 h-4" aria-hidden="true" />
          <span>החיבור לעדכונים בזמן אמת נותק.</span>
          <button
            onClick={() => window.location.reload()}
            className="underline font-medium hover:text-red-800"
          >
            רענן את הדף
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      {/* Conversation list - desktop: always visible, mobile: toggle */}
      <div
        className={`w-full md:w-[360px] shrink-0 ${
          showMobileList ? "block" : "hidden md:block"
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id || null}
          onSelect={handleSelectConversation}
          currentUserId={currentUser.id}
        />
      </div>

      {/* Message view */}
      <div
        className={`flex-1 ${
          showMobileList ? "hidden md:flex" : "flex"
        } flex-col`}
      >
        {selectedConversation ? (
          <MessageView
            conversationId={selectedConversation.id}
            contactName={selectedConversation.contact.profileName}
            contactPhone={
              selectedConversation.contact.phone ||
              selectedConversation.contact.waId
            }
            companyUsers={companyUsers}
            onBack={() => setShowMobileList(true)}
            onConversationUpdate={handleConversationUpdate}
            realtimeMessages={realtimeMessages}
            realtimeStatusUpdates={realtimeStatusUpdates}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400" role="status">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" aria-hidden="true" />
            <p className="text-lg font-medium">וואטסאפ עסקי</p>
            <p className="text-sm">בחר שיחה מהרשימה כדי להתחיל</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
