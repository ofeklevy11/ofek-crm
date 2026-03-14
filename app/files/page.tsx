import type { Metadata } from "next";
import { Suspense } from "react";
import { getStorageData } from "@/app/actions/storage";
import { FileExplorer } from "@/components/files/file-explorer";
import { UploadFileModal } from "@/components/files/upload-modal";
import { CreateFolderModal } from "@/components/files/create-folder-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { isRateLimitError } from "@/lib/rate-limit-utils";
import RateLimitFallback from "@/components/RateLimitFallback";
import { FilesPageClient } from "@/components/files/files-page-client";
import { SourceSwitcherWrapper } from "@/components/files/source-switcher-wrapper";

export const metadata: Metadata = { title: "קבצים" };

interface PageProps {
  searchParams: Promise<{
    folderId?: string;
    source?: string;
    driveFolderId?: string;
  }>;
}

export default async function FilesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const source = resolvedSearchParams.source || "internal";

  // Drive source - render entirely client-side
  if (source === "drive") {
    return (
      <Suspense fallback={<FilesSkeleton />}>
        <FilesPageClient searchParams={resolvedSearchParams} />
      </Suspense>
    );
  }

  // Internal file library (existing behavior, unchanged)
  const parsedFolderId = resolvedSearchParams.folderId
    ? parseInt(resolvedSearchParams.folderId, 10)
    : NaN;
  const folderId =
    Number.isSafeInteger(parsedFolderId) && parsedFolderId > 0
      ? parsedFolderId
      : null;
  let data;
  try {
    data = await getStorageData(folderId);
  } catch (e) {
    if (isRateLimitError(e)) return <RateLimitFallback />;
    throw e;
  }

  return (
    <main className="container mx-auto py-8" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black">
            ספריית קבצים
          </h1>
          <p className="text-gray-500 mt-1">
            נהל את המסמכים, המדיניות והנכסים שלך בצורה מקצועית.
          </p>
        </div>
        <div className="flex gap-2">
          <SourceSwitcherWrapper />
          <CreateFolderModal currentFolderId={folderId} />
          <UploadFileModal currentFolderId={folderId} />
        </div>
      </div>

      <Suspense fallback={<FilesSkeleton />}>
        <FileExplorer data={data} currentFolderId={folderId} />
      </Suspense>
    </main>
  );
}

function FilesSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="טוען קבצים...">
      <span className="sr-only">טוען קבצים...</span>
      <div className="h-10 w-full bg-muted rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
