"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { UserTier } from "@/lib/nurture-rate-limit";

interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  tier: UserTier;
  isUnlimited: boolean;
  refreshQuota: () => Promise<void>;
}

const NurtureQuotaContext = createContext<QuotaState | null>(null);

const TIER_LIMITS: Record<UserTier, number> = {
  basic: 3,
  premium: 6,
  super: Infinity,
};

export function NurtureQuotaProvider({
  tier,
  children,
}: {
  tier: UserTier;
  children: React.ReactNode;
}) {
  const limit = TIER_LIMITS[tier];
  const isUnlimited = tier === "super";

  const [used, setUsed] = useState(0);
  const [remaining, setRemaining] = useState(limit);
  const [resetInSeconds, setResetInSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQuota = useCallback(async () => {
    if (isUnlimited) return;
    try {
      const { getNurtureQuotaAction } = await import("@/app/nurture-hub/actions");
      const data = await getNurtureQuotaAction();
      if (data) {
        setUsed(data.used);
        setRemaining(data.remaining);
        setResetInSeconds(data.resetInSeconds);
      }
    } catch {
      // Silently fail — keep current state
    }
  }, [isUnlimited]);

  // Initial fetch
  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Countdown timer
  useEffect(() => {
    if (isUnlimited) return;

    intervalRef.current = setInterval(() => {
      setResetInSeconds((prev) => {
        if (prev <= 0) return 0; // Already idle — don't poll
        if (prev === 1) {
          // Window just expired — reset optimistically, then re-fetch
          setUsed(0);
          setRemaining(limit);
          fetchQuota();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isUnlimited, limit, fetchQuota]);

  const refreshQuota = useCallback(async () => {
    await fetchQuota();
  }, [fetchQuota]);

  return (
    <NurtureQuotaContext.Provider
      value={{ used, limit, remaining, resetInSeconds, tier, isUnlimited, refreshQuota }}
    >
      {children}
    </NurtureQuotaContext.Provider>
  );
}

export function useNurtureQuota(): QuotaState {
  const ctx = useContext(NurtureQuotaContext);
  if (!ctx) throw new Error("useNurtureQuota must be used within NurtureQuotaProvider");
  return ctx;
}
