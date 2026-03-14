"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_DISPLAY_SIZE = 500 * 1024; // 500KB

interface TextPreviewProps {
  fileId: number;
}

export function TextPreview({ fileId }: TextPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load file");
        }
        const text = await res.text();
        if (!cancelled) {
          if (text.length > MAX_DISPLAY_SIZE) {
            setContent(text.slice(0, MAX_DISPLAY_SIZE));
            setTruncated(true);
          } else {
            setContent(text);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [fileId]);

  if (loading) {
    return (
      <div className="space-y-2 p-4" role="status" aria-label="טוען תצוגה מקדימה...">
        <span className="sr-only">טוען תצוגה מקדימה...</span>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div>
      <ScrollArea className="h-[60vh] rounded-md border">
        <pre
          dir="ltr"
          className="p-4 text-sm whitespace-pre-wrap break-words font-mono"
        >
          {content}
        </pre>
      </ScrollArea>
      {truncated && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          מוצגים 500KB הראשונים. הורד את הקובץ לצפייה מלאה.
        </p>
      )}
    </div>
  );
}
