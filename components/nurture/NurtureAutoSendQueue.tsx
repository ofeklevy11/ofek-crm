"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, X, Check, AlertCircle, Smartphone, MessageSquare, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAutoSendQueue } from "@/app/nurture-hub/actions";
import { useNurtureQuota } from "./NurtureQuotaContext";

interface AutoSendQueueProps {
  slug: string;
  trigger: number;
}

const POLL_INTERVAL = 2_000;
const MAX_POLL_TIME = 120_000;

const AVATAR_COLORS = [
  "bg-pink-500", "bg-indigo-500", "bg-emerald-500", "bg-amber-500",
  "bg-cyan-500", "bg-purple-500", "bg-rose-500", "bg-teal-500",
];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type QueueItem = { id: number; name: string; phone: string; status: string; sentAt: string };
type Channels = { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean; email: boolean };

export default function NurtureAutoSendQueue({ slug, trigger }: AutoSendQueueProps) {
  const quota = useNurtureQuota();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const prevCompletedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await getAutoSendQueue(slug);
      if (!data || data.items.length === 0) return;

      setItems(data.items);
      setChannels(data.channels);
      setVisible(true);

      const completed = data.items.filter((i) => i.status === "SENT" || i.status === "FAILED").length;
      if (completed > prevCompletedRef.current) {
        quota.refreshQuota();
      }
      prevCompletedRef.current = completed;

      const allDone = completed >= data.items.length;
      if (allDone || Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        stopPolling();
      }
    } catch {
      // silently fail
    }
  }, [slug, quota, stopPolling]);

  useEffect(() => {
    if (trigger <= 0) return;
    startTimeRef.current = Date.now();
    prevCompletedRef.current = 0;
    setVisible(true);
    setCollapsed(false);
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return stopPolling;
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || items.length === 0) return null;

  const total = items.length;
  const completed = items.filter((i) => i.status === "SENT").length;
  const failed = items.filter((i) => i.status === "FAILED").length;
  const processed = completed + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const allDone = total > 0 && processed >= total;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-300",
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", allDone ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
          <span className="font-semibold text-sm text-slate-800">שליחה אוטומטית</span>
          <span className="text-xs text-slate-500">{processed}/{total}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => setVisible(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              allDone
                ? failed > 0 ? "bg-gradient-to-l from-amber-400 to-emerald-400" : "bg-gradient-to-l from-emerald-400 to-emerald-500"
                : "bg-gradient-to-l from-indigo-400 to-indigo-600",
              !allDone && "queue-autosend-glow"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", getAvatarColor(item.name))}>
                {getInitials(item.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {channels?.sms && <Smartphone className="w-3 h-3 text-pink-500" />}
                  {channels?.whatsappGreen && <MessageSquare className="w-3 h-3 text-emerald-500" />}
                  {channels?.whatsappCloud && <MessageSquare className="w-3 h-3 text-blue-500" />}
                  {channels?.email && <Mail className="w-3 h-3 text-purple-500" />}
                </div>
              </div>
              {item.status === "DISPATCHED" && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
              {item.status === "SENT" && <Check className="w-4 h-4 text-emerald-500" />}
              {item.status === "FAILED" && <AlertCircle className="w-4 h-4 text-red-500" />}
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
        .queue-autosend-glow {
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
}
