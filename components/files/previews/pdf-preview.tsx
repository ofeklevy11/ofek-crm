"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ChevronLeft } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const LazyDocument = lazy(() =>
  import("react-pdf").then((mod) => ({ default: mod.Document })),
);
const LazyPage = lazy(() =>
  import("react-pdf").then((mod) => ({ default: mod.Page })),
);

// Configure worker
import { pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfPreviewProps {
  fileId: number;
}

export function PdfPreview({ fileId }: PdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) throw new Error("Failed to load PDF");

        const blob = await res.blob();
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
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
        <Skeleton className="w-[400px] h-[500px] rounded-lg" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {error || "Failed to load PDF"}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="overflow-auto max-h-[60vh] rounded-md border bg-muted/30 w-full flex justify-center">
        <Suspense
          fallback={<Skeleton className="w-[400px] h-[500px] rounded-lg m-4" />}
        >
          <LazyDocument
            file={url}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setError("Failed to render PDF")}
            loading={<Skeleton className="w-[400px] h-[500px] rounded-lg m-4" />}
          >
            <LazyPage
              pageNumber={currentPage}
              width={700}
              loading={<Skeleton className="w-[400px] h-[500px] rounded-lg m-4" />}
            />
          </LazyDocument>
        </Suspense>
      </div>

      {numPages > 1 && (
        <div className="flex items-center gap-3" dir="ltr">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
