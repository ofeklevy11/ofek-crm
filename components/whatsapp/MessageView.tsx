"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import ConversationHeader from "./ConversationHeader";
import WindowBanner from "./WindowBanner";
import {
  getConversationMessages,
  sendWhatsAppMessage,
  markConversationAsRead,
} from "@/app/actions/whatsapp";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface Message {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  status: string;
  timestamp: Date | string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaFileName: string | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  locationAddress: string | null;
  sentByUser: { id: number; name: string } | null;
  wamId: string | null;
}

interface ConversationMeta {
  lastInboundAt: Date | string | null;
  status: string;
  assignedUserId: number | null;
}

interface MessageViewProps {
  conversationId: number;
  contactName: string | null;
  contactPhone: string;
  companyUsers: { id: number; name: string; role: string }[];
  onBack?: () => void;
  onConversationUpdate: () => void;
  realtimeMessages: Message[];
  realtimeStatusUpdates: { wamId: string; status: string }[];
}

export default function MessageView({
  conversationId,
  contactName,
  contactPhone,
  companyUsers,
  onBack,
  onConversationUpdate,
  realtimeMessages,
  realtimeStatusUpdates,
}: MessageViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevConversationId = useRef<number | null>(null);

  // Load messages when conversation changes
  useEffect(() => {
    if (prevConversationId.current !== conversationId) {
      prevConversationId.current = conversationId;
      setMessages([]);
      setHasMore(true);
      loadMessages();
      // Mark as read
      markConversationAsRead(conversationId).catch(() => {});
    }
  }, [conversationId]);

  // Append real-time messages
  useEffect(() => {
    if (realtimeMessages.length > 0) {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const newMsgs = realtimeMessages.filter((m) => !existing.has(m.id));
        if (newMsgs.length === 0) return prev;
        return [...newMsgs, ...prev];
      });
      // Scroll to bottom on new message
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      // Mark as read
      markConversationAsRead(conversationId).catch(() => {});
    }
  }, [realtimeMessages, conversationId]);

  // Apply real-time status updates
  useEffect(() => {
    if (realtimeStatusUpdates.length > 0) {
      setMessages((prev) =>
        prev.map((m) => {
          const update = realtimeStatusUpdates.find(
            (u) => u.wamId === m.wamId,
          );
          if (update) {
            return { ...m, status: update.status };
          }
          return m;
        }),
      );
    }
  }, [realtimeStatusUpdates]);

  const loadMessages = async (cursor?: string) => {
    try {
      if (cursor) setLoadingMore(true);
      else setLoading(true);

      const result = await getConversationMessages({
        conversationId,
        cursor: cursor || undefined,
        limit: 50,
      });

      setMeta(result.conversationMeta);

      if (result.messages.length < 50) {
        setHasMore(false);
      }

      if (cursor) {
        setMessages((prev) => [...prev, ...result.messages as unknown as Message[]]);
      } else {
        setMessages(result.messages as unknown as Message[]);
        // Scroll to bottom
        setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
      }
    } catch (error) {
      toast.error("שגיאה בטעינת הודעות");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldestMsg = messages[messages.length - 1];
    loadMessages(oldestMsg.id);
  }, [loadingMore, hasMore, messages]);

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop } = scrollRef.current;
    // Since messages are in reverse order (newest first), scrolling up loads more
    if (scrollTop === 0 && hasMore && !loadingMore) {
      handleLoadMore();
    }
  }, [handleLoadMore, hasMore, loadingMore]);

  const handleSend = async (body: string) => {
    try {
      await sendWhatsAppMessage({ conversationId, body, type: "text" });
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
      throw error;
    }
  };

  const assignedUser = meta?.assignedUserId
    ? companyUsers.find((u) => u.id === meta.assignedUserId) || null
    : null;

  const isWindowOpen = meta?.lastInboundAt
    ? (Date.now() - new Date(meta.lastInboundAt).getTime()) / (1000 * 60 * 60) < 24
    : false;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <ConversationHeader
        conversationId={conversationId}
        contactName={contactName}
        contactPhone={contactPhone}
        status={meta?.status || "OPEN"}
        assignedUser={assignedUser ? { id: assignedUser.id, name: assignedUser.name } : null}
        companyUsers={companyUsers}
        onBack={onBack}
        onUpdate={onConversationUpdate}
      />

      <WindowBanner
        lastInboundAt={meta?.lastInboundAt || null}
        status={meta?.status || "OPEN"}
      />

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Load more indicator */}
            {loadingMore && (
              <div className="text-center py-2">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full" />
              </div>
            )}

            {!hasMore && messages.length > 0 && (
              <p className="text-center text-xs text-gray-400 py-2">
                תחילת השיחה
              </p>
            )}

            {/* Messages in reverse chronological order */}
            <div className="flex flex-col-reverse">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  direction={msg.direction}
                  type={msg.type}
                  body={msg.body}
                  status={msg.status}
                  timestamp={msg.timestamp}
                  senderName={msg.sentByUser?.name}
                  mediaUrl={msg.mediaUrl}
                  mediaMime={msg.mediaMime}
                  mediaFileName={msg.mediaFileName}
                  latitude={msg.latitude}
                  longitude={msg.longitude}
                  locationName={msg.locationName}
                  locationAddress={msg.locationAddress}
                />
              ))}
            </div>

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        disabled={meta?.status === "CLOSED" || !isWindowOpen}
        placeholder={
          meta?.status === "CLOSED"
            ? "השיחה סגורה"
            : !isWindowOpen
              ? "חלון ה-24 שעות פג — נדרשת הודעת תבנית"
              : "הקלד הודעה..."
        }
      />
    </div>
  );
}
