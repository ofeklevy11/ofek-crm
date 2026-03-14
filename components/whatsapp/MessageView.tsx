"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import ConversationHeader from "./ConversationHeader";
import WindowBanner from "./WindowBanner";
import {
  getConversationMessages,
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  markConversationAsRead,
} from "@/app/actions/whatsapp";
import TemplatePicker from "./TemplatePicker";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { FileText, RefreshCw } from "lucide-react";

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
  const [loadError, setLoadError] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevConversationId = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);

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
      // Only auto-scroll if user is near the bottom (not reading old messages)
      if (isNearBottomRef.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
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
      setLoadError(false);

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
      if (!cursor) setLoadError(true);
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

  // Infinite scroll detection + track scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Track if user is near the bottom for auto-scroll decisions
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
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

  const handleSendTemplate = async (
    templateName: string,
    languageCode: string,
    components?: any[],
  ) => {
    await sendWhatsAppTemplateMessage({
      conversationId,
      templateName,
      languageCode,
      components,
    });
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
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="הודעות"
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full" role="status" aria-label="טוען הודעות">
            <span className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full" />
          </div>
        ) : loadError && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500" role="alert">
            <p className="text-sm">שגיאה בטעינת הודעות</p>
            <button
              onClick={() => loadMessages()}
              aria-label="נסה שוב לטעון הודעות"
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              נסה שוב
            </button>
          </div>
        ) : (
          <>
            {/* Load more indicator */}
            {loadingMore && (
              <div className="text-center py-2" role="status" aria-label="טוען הודעות נוספות">
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
      {meta?.status === "CLOSED" ? (
        <MessageInput onSend={handleSend} disabled placeholder="השיחה סגורה" />
      ) : !isWindowOpen ? (
        <div className="flex items-center justify-center p-3 border-t bg-white">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            שלח הודעת תבנית
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-0 bg-white">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="shrink-0 mr-1 mb-3 ml-3 flex items-center gap-1 px-2.5 py-2 text-xs rounded-lg border border-green-600 text-green-700 hover:bg-green-50 transition-colors"
            title="שלח הודעת תבנית"
            aria-label="שלח הודעת תבנית"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            תבנית
          </button>
          <div className="flex-1">
            <MessageInput onSend={handleSend} placeholder="הקלד הודעה..." />
          </div>
        </div>
      )}

      <TemplatePicker
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        conversationId={conversationId}
        onSend={handleSendTemplate}
      />
    </div>
  );
}
