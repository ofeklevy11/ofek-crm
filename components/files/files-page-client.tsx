"use client";

import { useEffect, useState, useCallback } from "react";
import { SourceSwitcher } from "./source-switcher";
import { DriveConnectionCard } from "./drive-connection-card";
import { DriveFileExplorer } from "./drive-file-explorer";
import { Skeleton } from "@/components/ui/skeleton";

interface DriveStatus {
  connected: boolean;
  email?: string;
  selectedFolders?: { driveFolderId: string; folderName: string }[];
}

interface FilesPageClientProps {
  searchParams: { source?: string; driveFolderId?: string };
}

export function FilesPageClient({ searchParams }: FilesPageClientProps) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google/drive/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStatusChange = () => {
    setIsLoading(true);
    fetchStatus();
  };

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
          <SourceSwitcher driveConnected={status?.connected || false} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-10 w-full bg-muted rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      ) : !status?.connected ? (
        <DriveConnectionCard />
      ) : (
        <DriveFileExplorer
          status={status}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
