"use client";

import { useState, useEffect, useRef } from "react";

const COUNTDOWN_SECONDS = 60;

function reload(): void {
  window.location.reload();
}

export default function RateLimitFallback() {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const id = setInterval(() => {
      if (isPausedRef.current) return;

      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (countdown === 0 && !isPausedRef.current) {
      reload();
    }
  }, [countdown]);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
    >
      <span className="text-4xl" aria-hidden="true">
        &#9203;
      </span>
      <div role="alert">
        <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-400">
          בוצעו יותר מדי פניות
        </h2>
        <p
          className="text-amber-600 dark:text-amber-300 text-sm text-center"
          aria-live="polite"
          aria-atomic="true"
        >
          אנא המתינו, הדף יתרענן אוטומטית בעוד{" "}
          <span className="font-bold tabular-nums">{countdown}</span> שניות
        </p>
      </div>
      <button
        onClick={reload}
        className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
      >
        נסה שוב עכשיו
      </button>
      <button
        onClick={() => setIsPaused((p) => !p)}
        className="rounded border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
      >
        {isPaused ? "המשך ספירה" : "עצור ספירה אוטומטית"}
      </button>
    </div>
  );
}
