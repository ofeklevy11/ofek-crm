"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { SourceSwitcher } from "./source-switcher";
import { DriveConnectionCard } from "./drive-connection-card";
import { DriveFileExplorer } from "./drive-file-explorer";
import { Skeleton } from "@/components/ui/skeleton";

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  no_refresh_token: "לא התקבל אישור מלא מ-Google. נסה להתחבר שוב.",
  callback_failed: "שגיאה בתהליך ההתחברות ל-Google Drive.",
  no_code: "לא התקבל קוד אימות מ-Google.",
  token_exchange_failed: "שגיאה בהחלפת קוד האימות. נסה שוב.",
  missing_state: "פרטי האימות חסרים. נסה להתחבר שוב.",
  invalid_state: "פרטי האימות אינם תקינים. נסה להתחבר שוב.",
  missing_scope: "לא ניתנה הרשאה ל-Google Drive. נסה להתחבר שוב ואשר גישה לדרייב.",
};

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
  const urlParams = useSearchParams();
  const router = useRouter();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google/drive/status", {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus({ connected: false });
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Read OAuth callback URL params and show toasts
  useEffect(() => {
    const error = urlParams.get("driveError");
    const connected = urlParams.get("driveConnected");

    if (error) {
      toast.error(DRIVE_ERROR_MESSAGES[error] || "שגיאה בהתחברות ל-Google Drive.");
    } else if (connected === "true") {
      toast.success("Google Drive חובר בהצלחה!");
    }

    if (error || connected) {
      router.replace("/files?source=drive");
    }
  }, [urlParams, router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStatusChange = () => {
    setIsLoading(true);
    fetchStatus();
  };

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
          <SourceSwitcher driveConnected={status?.connected || false} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6" role="status" aria-label="טוען קבצים...">
          <span className="sr-only">טוען קבצים...</span>
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
    </main>
  );
}
