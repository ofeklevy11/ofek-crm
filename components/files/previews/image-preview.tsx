"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface ImagePreviewProps {
  fileId: number;
}

export function ImagePreview({ fileId }: ImagePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) {
          throw new Error("Failed to load image");
        }
        const blob = await res.blob();
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load image");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Skeleton className="w-64 h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {error || "Failed to load image"}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-[60vh]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Preview"
        className="max-h-full max-w-full object-contain rounded-lg"
      />
    </div>
  );
}
