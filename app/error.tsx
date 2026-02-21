"use client";

import { useState, useEffect } from "react";

const RATE_LIMIT_COUNTDOWN = 30;

function isRateLimitError(message: string) {
  return message.includes("יותר מדי פניות");
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const rateLimited = isRateLimitError(error.message ?? "");
  const [countdown, setCountdown] = useState(RATE_LIMIT_COUNTDOWN);

  useEffect(() => {
    if (!rateLimited) return;
    setCountdown(RATE_LIMIT_COUNTDOWN);
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          reset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimited, reset]);

  if (rateLimited) {
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
          onClick={reset}
          className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
        >
          נסה שוב עכשיו
        </button>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
    >
      <h2 className="text-xl font-semibold">אירעה שגיאה</h2>
      <p className="text-muted-foreground text-sm">
        אנא נסה שוב. אם הבעיה נמשכת, פנה לתמיכה.
      </p>
      <button
        onClick={reset}
        className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
      >
        נסה שוב
      </button>
    </div>
  );
}
