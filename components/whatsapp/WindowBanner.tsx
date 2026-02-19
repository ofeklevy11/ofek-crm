"use client";

import { Clock, AlertTriangle } from "lucide-react";

interface WindowBannerProps {
  lastInboundAt: Date | string | null;
  status: string;
}

export default function WindowBanner({
  lastInboundAt,
  status,
}: WindowBannerProps) {
  if (status === "CLOSED") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 text-sm border-b">
        <AlertTriangle className="w-4 h-4" />
        <span>שיחה זו סגורה</span>
      </div>
    );
  }

  if (!lastInboundAt) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 text-sm border-b">
        <AlertTriangle className="w-4 h-4" />
        <span>
          אין הודעה נכנסת מהלקוח — ניתן לשלוח רק הודעות תבנית (Template)
        </span>
      </div>
    );
  }

  const lastInbound = new Date(lastInboundAt);
  const hoursElapsed =
    (Date.now() - lastInbound.getTime()) / (1000 * 60 * 60);

  if (hoursElapsed > 24) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm border-b">
        <AlertTriangle className="w-4 h-4" />
        <span>
          חלון ה-24 שעות פג — ניתן לשלוח רק הודעות תבנית (Template)
        </span>
      </div>
    );
  }

  if (hoursElapsed > 20) {
    const minutesLeft = Math.round((24 - hoursElapsed) * 60);
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 text-sm border-b">
        <Clock className="w-4 h-4" />
        <span>
          חלון ה-24 שעות ייסגר בעוד {minutesLeft} דקות
        </span>
      </div>
    );
  }

  return null;
}
