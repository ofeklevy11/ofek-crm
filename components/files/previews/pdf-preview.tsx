"use client";

import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ChevronLeft } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure worker — static file from public/ works with both Turbopack (dev) and webpack (prod)
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfPreviewProps {
  fileId: number;
}

export function PdfPreview({ fileId }: PdfPreviewProps) {
  const [data, setData] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) throw new Error("Failed to load PDF");

        const buf = await res.arrayBuffer();
        if (!cancelled) {
          setData(new Uint8Array(buf));
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
    };
  }, [fileId]);

  // Memoize so react-pdf doesn't reset/re-load on every render
  const fileData = useMemo(() => (data ? { data } : null), [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]" role="status" aria-label="טוען תצוגה מקדימה...">
        <span className="sr-only">טוען תצוגה מקדימה...</span>
        <Skeleton className="w-[400px] h-[500px] rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {error || "Failed to load PDF"}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="overflow-auto max-h-[60vh] rounded-md border bg-muted/30 w-full flex justify-center">
        <Document
          file={fileData}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => {
            console.error("PDF render error:", err);
            setError("Failed to render PDF");
          }}
          loading={<Skeleton className="w-[400px] h-[500px] rounded-lg m-4" />}
        >
          <Page
            pageNumber={currentPage}
            width={700}
            loading={<Skeleton className="w-[400px] h-[500px] rounded-lg m-4" />}
          />
        </Document>
      </div>

      {numPages > 1 && (
        <div className="flex items-center gap-3" dir="ltr">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="עמוד קודם"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-muted-foreground" aria-live="polite" aria-label={`עמוד ${currentPage} מתוך ${numPages}`}>
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="עמוד הבא"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
