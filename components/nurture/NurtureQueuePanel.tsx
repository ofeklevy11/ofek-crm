"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, X, Check, AlertCircle, MessageSquare, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNurtureBatchStatus } from "@/app/nurture-hub/actions";

type QueueItemStatus = "pending" | "sending" | "sent" | "failed";

interface QueueItem {
  phone: string;
  name: string;
  status: QueueItemStatus;
  channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean };
  templateName: string;
}

interface NurtureQueuePanelProps {
  batchId: string | null;
  onClose: () => void;
}

const POLL_INTERVAL = 2000;
const MAX_POLL_TIME = 300_000; // 5 min

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-pink-500", "bg-indigo-500", "bg-emerald-500", "bg-amber-500",
  "bg-cyan-500", "bg-purple-500", "bg-rose-500", "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function NurtureQueuePanel({ batchId, onClose }: NurtureQueuePanelProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [meta, setMeta] = useState<{ totalCount: number; completedCount: number; failedCount: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);
  const startTimeRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!batchId) return;
    const status = await getNurtureBatchStatus(batchId);
    if (!status) return;
    setMeta({ totalCount: status.meta.totalCount, completedCount: status.meta.completedCount, failedCount: status.meta.failedCount });
    setItems(status.items);

    // Stop polling when complete
    const done = status.meta.completedCount + status.meta.failedCount >= status.meta.totalCount;
    const elapsed = Date.now() - startTimeRef.current;
    if (done || elapsed > MAX_POLL_TIME) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [batchId]);

  useEffect(() => {
    if (!batchId) {
      setVisible(false);
      return;
    }
    startTimeRef.current = Date.now();
    setVisible(true);
    setCollapsed(false);
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [batchId, poll]);

  if (!batchId || !visible) return null;

  const total = meta?.totalCount ?? 0;
  const completed = meta?.completedCount ?? 0;
  const failed = meta?.failedCount ?? 0;
  const processed = completed + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const allDone = total > 0 && processed >= total;

  return (
    <div
      role="region"
      aria-label="תור שליחה"
      className={cn(
        "fixed bottom-4 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-300",
        "animate-slide-in-left"
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", allDone ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
          <span className="font-semibold text-sm text-slate-800">תור שליחה</span>
          <span className="text-xs text-slate-500">
            {processed}/{total} נשלחו
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "הרחב" : "כווץ"} aria-expanded={!collapsed} className="p-1 rounded hover:bg-slate-100 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={onClose} aria-label="סגור" className="p-1 rounded hover:bg-slate-100 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2" aria-live="polite">
        <div
          className="h-2 rounded-full bg-slate-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={processed}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="התקדמות שליחה"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              allDone
                ? failed > 0 ? "bg-gradient-to-l from-amber-400 to-emerald-400" : "bg-gradient-to-l from-emerald-400 to-emerald-500"
                : "bg-gradient-to-l from-indigo-400 to-indigo-600",
              !allDone && "queue-progress-glow"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Item list */}
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {items.map((item, idx) => (
            <div
              key={item.phone}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors animate-fade-in-up"
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
            >
              {/* Avatar */}
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", getAvatarColor(item.name))}>
                {getInitials(item.name)}
              </div>

              {/* Name + template */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {item.channels.sms && <><Smartphone className="w-3 h-3 text-pink-500" aria-hidden="true" /><span className="sr-only">SMS</span></>}
                  {item.channels.whatsappGreen && <><MessageSquare className="w-3 h-3 text-emerald-500" aria-hidden="true" /><span className="sr-only">WhatsApp</span></>}
                  {item.channels.whatsappCloud && <><MessageSquare className="w-3 h-3 text-blue-500" aria-hidden="true" /><span className="sr-only">WhatsApp Cloud</span></>}
                </div>
              </div>

              {/* Status */}
              <StatusIndicator status={item.status} />
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!collapsed && allDone && (
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500 text-center">
          {completed > 0 && <span className="text-emerald-600 font-medium">{completed} נשלחו</span>}
          {completed > 0 && failed > 0 && <span className="mx-1">,</span>}
          {failed > 0 && <span className="text-red-500 font-medium">{failed} נכשלו</span>}
        </div>
      )}

      <style jsx>{`
        .queue-progress-glow {
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
}

function StatusIndicator({ status }: { status: QueueItemStatus }) {
  const labels: Record<QueueItemStatus, string> = { pending: "ממתין", sending: "שולח", sent: "נשלח", failed: "נכשל" };
  switch (status) {
    case "pending":
      return <div className="w-5 h-5 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-slate-300" /><span className="sr-only">{labels[status]}</span></div>;
    case "sending":
      return <div className="w-5 h-5 flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" /><span className="sr-only">{labels[status]}</span></div>;
    case "sent":
      return (
        <div className="w-5 h-5 flex items-center justify-center animate-scale-in">
          <Check className="w-4 h-4 text-emerald-500" />
          <span className="sr-only">{labels[status]}</span>
        </div>
      );
    case "failed":
      return (
        <div className="w-5 h-5 flex items-center justify-center animate-scale-in">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="sr-only">{labels[status]}</span>
        </div>
      );
  }
}
