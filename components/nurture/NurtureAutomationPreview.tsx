"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Users, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { useNurtureQuota } from "./NurtureQuotaContext";
import { getRecentAutoSendActivity } from "@/app/nurture-hub/actions";
import type { NurtureMessage } from "@/components/nurture/NurtureMessageEditor";
import { getActiveMessage } from "@/lib/nurture-messages";

interface NurtureAutomationPreviewProps {
  slug: string;
  channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean; email: boolean };
  messages: NurtureMessage[];
  timing: string;
  customerCount: number;
  isEnabled: boolean;
  accentColor?: string;
  refreshTrigger?: number;
}

const TIMING_LABELS: Record<string, string> = {
  manual: "ידני",
  immediate: "מיידית",
  "1_hour": "שעה אחרי",
  "24_hours": "יום אחרי",
  "3_days": "3 ימים אחרי",
  "1_week": "שבוע אחרי",
  "2_weeks": "שבועיים אחרי",
  "1_month": "חודש אחרי",
  cron: "סריקה יומית",
};

export default function NurtureAutomationPreview({
  slug,
  channels,
  messages,
  timing,
  customerCount,
  isEnabled,
  refreshTrigger,
}: NurtureAutomationPreviewProps) {
  const quota = useNurtureQuota();
  const [activity, setActivity] = useState<{
    pendingCount: number;
    totalSentToday: number;
    lastSendAt: string | null;
  } | null>(null);
  const prevSentTodayRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibleRef = useRef(true);

  const shouldPoll = timing !== "manual" || (activity !== null && (activity.pendingCount > 0 || activity.totalSentToday > 0));

  const fetchActivity = useCallback(async () => {
    if (!visibleRef.current) return;
    try {
      const data = await getRecentAutoSendActivity(slug);
      if (data) {
        // If new sends detected, refresh quota
        if (data.totalSentToday > prevSentTodayRef.current && prevSentTodayRef.current > 0) {
          quota.refreshQuota();
        }
        prevSentTodayRef.current = data.totalSentToday;
        setActivity(data);
      }
    } catch {
      // Silently fail
    }
  }, [slug, quota]);

  // Initial fetch
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Immediate refresh when refreshTrigger changes (e.g. after auto-send dispatch)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchActivity();
    }
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  useEffect(() => {
    if (!shouldPoll) return;

    intervalRef.current = setInterval(fetchActivity, 10_000);

    const handleVisibility = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) fetchActivity();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [shouldPoll, fetchActivity]);

  const activeMsg = getActiveMessage(messages);
  const msgPreview = activeMsg?.smsBody || activeMsg?.whatsappGreenBody || activeMsg?.emailBody || "";
  const truncatedMsg = msgPreview.length > 50 ? msgPreview.slice(0, 50) + "..." : msgPreview;

  const activeChannels: string[] = [];
  if (channels.sms) activeChannels.push("SMS");
  if (channels.whatsappGreen) activeChannels.push("WA");
  if (channels.whatsappCloud) activeChannels.push("WA Cloud");
  if (channels.email) activeChannels.push("Email");

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm shadow-sm">
      {/* Status badge */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2.5 h-2.5 rounded-full ${isEnabled ? "bg-green-500" : "bg-slate-300"}`}
        />
        <span className={`font-medium ${isEnabled ? "text-green-700" : "text-slate-400"}`}>
          {isEnabled ? "פעיל" : "מושבת"}
        </span>
      </div>

      <span className="text-slate-200">|</span>

      {/* Channels */}
      <div className="flex items-center gap-1.5 text-slate-600">
        <MessageSquare className="w-3.5 h-3.5" />
        {activeChannels.length > 0 ? (
          <span>{activeChannels.join(", ")}</span>
        ) : (
          <span className="text-slate-400">אין ערוצים</span>
        )}
      </div>

      <span className="text-slate-200">|</span>

      {/* Message preview */}
      {truncatedMsg && (
        <>
          <div className="text-slate-500 truncate max-w-[200px]" title={msgPreview}>
            &ldquo;{truncatedMsg}&rdquo;
          </div>
          <span className="text-slate-200">|</span>
        </>
      )}

      {/* Timing */}
      <div className="flex items-center gap-1.5 text-slate-600">
        <Clock className="w-3.5 h-3.5" />
        <span>{TIMING_LABELS[timing] || timing}</span>
      </div>

      <span className="text-slate-200">|</span>

      {/* Customer count */}
      <div className="flex items-center gap-1.5 text-slate-600">
        <Users className="w-3.5 h-3.5" />
        <span>{customerCount} לקוחות</span>
      </div>

      {/* Live activity */}
      {activity && (
        <>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-1.5">
            {activity.pendingCount > 0 ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-amber-600 font-medium">
                  {activity.pendingCount} בשליחה...
                </span>
              </>
            ) : activity.totalSentToday > 0 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-600">
                  {activity.totalSentToday} נשלחו היום
                </span>
              </>
            ) : null}
          </div>
        </>
      )}

      {/* Quota & Plan */}
      <div className="ml-auto flex items-center gap-1.5 text-xs tabular-nums">
        {quota.isUnlimited ? (
          <span className="text-indigo-600 font-medium">ללא הגבלה · Super</span>
        ) : (
          <>
            <span className={`font-medium ${
              quota.remaining === 0
                ? "text-red-600"
                : quota.used > 0
                ? "text-amber-600"
                : "text-green-600"
            }`}>
              {quota.remaining}/{quota.limit} הודעות זמינות
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-400">
              {quota.tier === "premium" ? "Premium" : "Basic"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
