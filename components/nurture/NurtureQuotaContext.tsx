"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UserTier } from "@/lib/nurture-rate-limit";

// Split into two contexts to prevent timer re-renders from cascading to all consumers
interface QuotaDataState {
  used: number;
  limit: number;
  remaining: number;
  tier: UserTier;
  isUnlimited: boolean;
  refreshQuota: () => Promise<void>;
}

interface QuotaTimerState {
  resetInSeconds: number;
}

const NurtureQuotaDataContext = createContext<QuotaDataState | null>(null);
const NurtureQuotaTimerContext = createContext<QuotaTimerState | null>(null);

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
          // Window just expired — reset optimistically
          setUsed(0);
          setRemaining(limit);
          // Delay re-fetch so Redis key has fully expired
          setTimeout(fetchQuota, 2000);
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

  // Memoize data context value so it only changes when data fields change (not on timer tick)
  const dataValue = useMemo(
    () => ({ used, limit, remaining, tier, isUnlimited, refreshQuota }),
    [used, limit, remaining, tier, isUnlimited, refreshQuota]
  );

  // Timer value changes every second (only NurtureQuotaBadge subscribes)
  const timerValue = useMemo(() => ({ resetInSeconds }), [resetInSeconds]);

  return (
    <NurtureQuotaDataContext.Provider value={dataValue}>
      <NurtureQuotaTimerContext.Provider value={timerValue}>
        {children}
      </NurtureQuotaTimerContext.Provider>
    </NurtureQuotaDataContext.Provider>
  );
}

/** Use quota data (used/limit/remaining) — does NOT re-render on timer tick */
export function useNurtureQuota(): QuotaDataState & { resetInSeconds: number } {
  const data = useContext(NurtureQuotaDataContext);
  const timer = useContext(NurtureQuotaTimerContext);
  if (!data || !timer) throw new Error("useNurtureQuota must be used within NurtureQuotaProvider");
  return { ...data, resetInSeconds: timer.resetInSeconds };
}

/** Use only the timer countdown — for badge/countdown display components */
export function useNurtureQuotaTimer(): QuotaTimerState {
  const ctx = useContext(NurtureQuotaTimerContext);
  if (!ctx) throw new Error("useNurtureQuotaTimer must be used within NurtureQuotaProvider");
  return ctx;
}
