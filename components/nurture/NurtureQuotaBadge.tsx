"use client";

import { useNurtureQuota } from "./NurtureQuotaContext";

export default function NurtureQuotaBadge() {
  const { used, limit, remaining, resetInSeconds, isUnlimited } = useNurtureQuota();

  if (isUnlimited) return null;

  // No messages sent yet — green
  if (used === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 tabular-nums">
        {remaining}/{limit} הודעות זמינות
      </span>
    );
  }

  // Exhausted — red
  if (remaining === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 tabular-nums">
        0/{limit} | {resetInSeconds}s
      </span>
    );
  }

  // Partially used — yellow
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 tabular-nums">
      {remaining}/{limit} נותרו | איפוס בעוד {resetInSeconds}s
    </span>
  );
}
