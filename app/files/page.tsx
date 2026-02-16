import { Suspense } from "react";
import { getStorageData } from "@/app/actions/storage";
import { FileExplorer } from "@/components/files/file-explorer";
import { UploadFileModal } from "@/components/files/upload-modal";
import { CreateFolderModal } from "@/components/files/create-folder-modal";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  searchParams: Promise<{ folderId?: string }>;
}

export default async function FilesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const parsedFolderId = resolvedSearchParams.folderId
    ? parseInt(resolvedSearchParams.folderId, 10)
    : NaN;
  const folderId =
    Number.isSafeInteger(parsedFolderId) && parsedFolderId > 0
      ? parsedFolderId
      : null;
  const data = await getStorageData(folderId);

  return (
    <div className="container mx-auto py-8" dir="rtl">
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
          <CreateFolderModal currentFolderId={folderId} />
          <UploadFileModal currentFolderId={folderId} />
        </div>
      </div>

      <Suspense fallback={<FilesSkeleton />}>
        <FileExplorer data={data} currentFolderId={folderId} />
      </Suspense>
    </div>
  );
}

function FilesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-full bg-muted rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
