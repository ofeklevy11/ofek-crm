"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
