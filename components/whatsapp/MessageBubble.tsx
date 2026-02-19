"use client";

import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";

interface MessageBubbleProps {
  direction: string;
  type: string;
  body: string | null;
  status: string;
  timestamp: Date | string;
  senderName?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaFileName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  locationAddress?: string | null;
}

export default function MessageBubble({
  direction,
  type,
  body,
  status,
  timestamp,
  senderName,
  mediaUrl,
  mediaMime,
  mediaFileName,
  latitude,
  longitude,
  locationName,
  locationAddress,
}: MessageBubbleProps) {
  const isOutbound = direction === "OUTBOUND";
  const time = new Date(timestamp).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex ${isOutbound ? "justify-start" : "justify-end"} mb-2`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isOutbound
            ? "bg-green-100 text-gray-900"
            : "bg-white text-gray-900 border border-gray-200"
        }`}
      >
        {/* Sender name for outbound */}
        {isOutbound && senderName && (
          <p className="text-xs font-semibold text-green-700 mb-1">
            {senderName}
          </p>
        )}

        {/* Media content */}
        {mediaUrl && renderMedia(type, mediaUrl, mediaMime, mediaFileName)}

        {/* Location */}
        {type === "LOCATION" && latitude && longitude && (
          <div className="mb-1">
            <a
              href={`https://maps.google.com/?q=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              {locationName || locationAddress || "מיקום"}
            </a>
            {locationAddress && locationAddress !== locationName && (
              <p className="text-xs text-gray-500">{locationAddress}</p>
            )}
          </div>
        )}

        {/* Text body */}
        {body && (
          <p className="text-sm whitespace-pre-wrap break-words">{body}</p>
        )}

        {/* No body fallback */}
        {!body && !mediaUrl && type !== "LOCATION" && (
          <p className="text-sm text-gray-400 italic">[{type}]</p>
        )}

        {/* Time and status */}
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOutbound ? "justify-start" : "justify-end"
          }`}
        >
          <span className="text-[10px] text-gray-400">{time}</span>
          {isOutbound && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return <Clock className="w-3 h-3 text-gray-400" />;
    case "SENT":
      return <Check className="w-3 h-3 text-gray-400" />;
    case "DELIVERED":
      return <CheckCheck className="w-3 h-3 text-gray-400" />;
    case "READ":
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    case "FAILED":
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return null;
  }
}

function renderMedia(
  type: string,
  url: string,
  mime: string | null | undefined,
  fileName: string | null | undefined,
) {
  if (type === "IMAGE") {
    return (
      <img
        src={url}
        alt="image"
        className="rounded max-w-full max-h-64 mb-1 cursor-pointer"
        loading="lazy"
        onClick={() => window.open(url, "_blank")}
      />
    );
  }
  if (type === "VIDEO") {
    return (
      <video
        src={url}
        controls
        className="rounded max-w-full max-h-64 mb-1"
        preload="metadata"
      />
    );
  }
  if (type === "AUDIO") {
    return <audio src={url} controls className="mb-1 max-w-full" />;
  }
  if (type === "DOCUMENT") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 bg-gray-50 rounded mb-1 hover:bg-gray-100 text-sm text-blue-600"
      >
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {fileName || "קובץ"}
      </a>
    );
  }
  if (type === "STICKER") {
    return (
      <img
        src={url}
        alt="sticker"
        className="w-32 h-32 mb-1"
        loading="lazy"
      />
    );
  }
  return null;
}
