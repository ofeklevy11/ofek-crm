"use client";

import { useNurtureQuota } from "./NurtureQuotaContext";

const TIER_LABELS: Record<string, string> = {
  basic: "בסיסי: 3 הודעות/דקה",
  premium: "פרימיום: 6 הודעות/דקה",
};

export default function NurtureQuotaBadge() {
  const { used, limit, remaining, resetInSeconds, tier, isUnlimited } = useNurtureQuota();

  if (isUnlimited) return null;

  const tierLabel = TIER_LABELS[tier];

  // No messages sent yet — green
  if (used === 0) {
    return (
      <div role="status" className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 tabular-nums">
          {remaining}/{limit} הודעות זמינות
        </span>
        {tierLabel && <span className="text-[10px] text-gray-400">{tierLabel}</span>}
      </div>
    );
  }

  // Exhausted — red
  if (remaining === 0) {
    return (
      <div role="status" className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 tabular-nums">
          0/{limit} | איפוס בעוד {resetInSeconds}s
        </span>
        {tierLabel && <span className="text-[10px] text-gray-400">{tierLabel}</span>}
      </div>
    );
  }

  // Partially used — yellow
  return (
    <div role="status" className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 tabular-nums">
        {remaining}/{limit} נותרו | איפוס בעוד {resetInSeconds}s
      </span>
      {tierLabel && <span className="text-[10px] text-gray-400">{tierLabel}</span>}
    </div>
  );
}
