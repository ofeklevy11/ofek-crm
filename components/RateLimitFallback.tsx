"use client";

import { useState, useEffect } from "react";

const COUNTDOWN_SECONDS = 60;

function reload() {
  window.location.reload();
}

export default function RateLimitFallback() {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
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
    if (countdown === 0) {
      reload();
    }
  }, [countdown]);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
    >
      <span className="text-4xl">&#9203;</span>
      <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-400">
        בוצעו יותר מדי פניות
      </h2>
      <p className="text-amber-600 dark:text-amber-300 text-sm text-center">
        אנא המתינו, הדף יתרענן אוטומטית בעוד{" "}
        <span className="font-bold tabular-nums">{countdown}</span> שניות
      </p>
      <button
        onClick={reload}
        className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
      >
        נסה שוב עכשיו
      </button>
    </div>
  );
}
