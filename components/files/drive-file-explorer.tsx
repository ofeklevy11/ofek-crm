"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Home,
  LayoutGrid,
  List,
  Table2,
  Files,
  Folder,
  FolderSync,
  Image,
  FileText,
  Music,
  FileVideo,
  FileCode,
  File,
  Settings,
  Loader2,
  Cloud,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { FolderCard } from "./folder-card";
import { FileCard } from "./file-card";
import { DriveFolderPickerModal } from "./drive-folder-picker-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { showConfirm } from "@/hooks/use-modal";
import { apiFetch } from "@/lib/api-fetch";

type ViewMode = "grid" | "list" | "compact";
type FileFilter =
  | "all"
  | "folders"
  | "images"
  | "pdf"
  | "audio"
  | "video"
  | "documents"
  | "other";

interface DriveStatus {
  connected: boolean;
  email?: string;
  selectedFolders?: { driveFolderId: string; folderName: string }[];
}

interface DriveFolder {
  id: string;
  name: string;
  _count: { files: number };
  totalSize: number;
  updatedAt: string;
}

interface DriveFile {
  id: string;
  name: string;
  displayName: null;
  size: number;
  type: string;
  updatedAt: string;
  createdAt: string;
  source: "google-drive";
  webViewLink: string | null;
  url: string | null;
}

const FILE_FILTERS: {
  id: FileFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
  match?: (type: string) => boolean;
}[] = [
  {
    id: "all",
    label: "כל הקבצים",
    icon: <Files className="w-4 h-4 ml-2" />,
    color: "text-gray-600",
  },
  {
    id: "folders",
    label: "תיקיות",
    icon: <Folder className="w-4 h-4 ml-2" />,
    color: "text-[#4f95ff]",
  },
  {
    id: "images",
    label: "תמונות",
    icon: <Image className="w-4 h-4 ml-2" />,
    color: "text-[#a24ec1]",
    match: (type) => type.includes("image"),
  },
  {
    id: "pdf",
    label: "PDF",
    icon: <FileText className="w-4 h-4 ml-2" />,
    color: "text-red-600",
    match: (type) => type.includes("pdf"),
  },
  {
    id: "audio",
    label: "שמע",
    icon: <Music className="w-4 h-4 ml-2" />,
    color: "text-[#4f95ff]",
    match: (type) => type.includes("audio"),
  },
  {
    id: "video",
    label: "וידאו",
    icon: <FileVideo className="w-4 h-4 ml-2" />,
    color: "text-pink-600",
    match: (type) => type.includes("video"),
  },
  {
    id: "documents",
    label: "מסמכים",
    icon: <FileCode className="w-4 h-4 ml-2" />,
    color: "text-green-600",
    match: (type) =>
      type.includes("text") ||
      type.includes("document") ||
      type.includes("spreadsheet") ||
      type.includes("word") ||
      type.includes("excel") ||
      type.includes("vnd.google-apps.document") ||
      type.includes("vnd.google-apps.spreadsheet"),
  },
  {
    id: "other",
    label: "אחר",
    icon: <File className="w-4 h-4 ml-2" />,
    color: "text-gray-500",
    match: () => true,
  },
];

interface DriveFileExplorerProps {
  status: DriveStatus;
  onStatusChange: () => void;
}

export function DriveFileExplorer({
  status,
  onStatusChange,
}: DriveFileExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const driveFolderId = searchParams.get("driveFolderId") || null;

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string; name: string }[]
  >([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadFiles = useCallback(
    async (folderId: string | null, pageToken?: string) => {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `/api/integrations/google/drive/files?${params}`,
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load files");
      }
      return res.json();
    },
    [],
  );

  useEffect(() => {
    if (!status.connected) return;

    // Auto-open folder picker if no folders selected
    if (
      !status.selectedFolders ||
      status.selectedFolders.length === 0
    ) {
      setShowFolderPicker(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    loadFiles(driveFolderId)
      .then((data) => {
        setFolders(data.folders || []);
        setFiles(data.files || []);
        setBreadcrumbs(data.breadcrumbs || []);
        setNextPageToken(data.nextPageToken || null);
      })
      .catch((err) => {
        toast.error(err.message || "שגיאה בטעינת קבצים");
      })
      .finally(() => setIsLoading(false));
  }, [status, driveFolderId, loadFiles]);

  const handleLoadMore = async () => {
    if (!nextPageToken || !driveFolderId) return;
    setIsLoadingMore(true);
    try {
      const data = await loadFiles(driveFolderId, nextPageToken);
      setFolders((prev) => [...prev, ...(data.folders || [])]);
      setFiles((prev) => [...prev, ...(data.files || [])]);
      setNextPageToken(data.nextPageToken || null);
    } catch {
      toast.error("שגיאה בטעינת קבצים נוספים");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleDisconnect = async () => {
    if (!(await showConfirm("האם אתה בטוח שברצונך לנתק את Google Drive?")))
      return;

    try {
      const res = await apiFetch("/api/integrations/google/drive/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to disconnect");
      }
      toast.success("Google Drive נותק בהצלחה");
      onStatusChange();
    } catch (err: any) {
      toast.error(err.message === "Rate limit exceeded. Please try again later."
        ? "יותר מדי ניסיונות. נסה שוב בעוד מספר דקות."
        : "שגיאה בניתוק Google Drive");
    }
  };

  const navigateToFolder = (folderId: string) => {
    router.push(`/files?source=drive&driveFolderId=${folderId}`);
  };

  const navigateToRoot = () => {
    router.push("/files?source=drive");
  };

  // Filter files
  const filteredFiles = useMemo(() => {
    if (fileFilter === "all" || fileFilter === "folders") return files;
    const filterConfig = FILE_FILTERS.find((f) => f.id === fileFilter);
    if (!filterConfig?.match) return files;
    if (fileFilter === "other") {
      const otherFilters = FILE_FILTERS.filter(
        (f) =>
          f.id !== "all" && f.id !== "folders" && f.id !== "other" && f.match,
      );
      return files.filter(
        (file) => !otherFilters.some((f) => f.match!(file.type)),
      );
    }
    return files.filter((file) => filterConfig.match!(file.type));
  }, [files, fileFilter]);

  const showFolders = fileFilter === "all" || fileFilter === "folders";
  const filteredFolders = showFolders ? folders : [];

  const fileCounts = useMemo(() => {
    const matchable = FILE_FILTERS.filter(
      (f) =>
        f.match && f.id !== "all" && f.id !== "folders" && f.id !== "other",
    );
    const counts: Record<string, number> = {
      all: files.length + folders.length,
      folders: folders.length,
    };
    for (const f of matchable) counts[f.id] = 0;
    let categorized = 0;
    for (const file of files) {
      for (const filter of matchable) {
        if (filter.match!(file.type)) {
          counts[filter.id]++;
          categorized++;
          break;
        }
      }
    }
    counts.other = files.length - categorized;
    return counts;
  }, [files, folders]);

  const viewModes: { mode: ViewMode; icon: React.ReactNode; label: string }[] =
    [
      { mode: "grid", icon: <LayoutGrid className="w-4 h-4" />, label: "רשת" },
      { mode: "list", icon: <List className="w-4 h-4" />, label: "רשימה" },
      { mode: "compact", icon: <Table2 className="w-4 h-4" />, label: "דחוס" },
    ];

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl" role="status" aria-label="טוען קבצים...">
        <span className="sr-only">טוען קבצים...</span>
        <div className="h-10 w-full bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Settings bar */}
      {showSettings && (
        <div className="p-4 bg-muted/50 rounded-xl border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-[#4f95ff]" />
              <span className="text-sm font-medium">מחובר כ-{status.email}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFolderPicker(true)}
              >
                שנה תיקיות
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-destructive hover:text-destructive"
              >
                נתק
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumbs and Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b">
        <nav className="flex items-center gap-1" aria-label="ניווט נתיב">
          <button
            onClick={navigateToRoot}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              !driveFolderId
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Home className="w-4 h-4 ml-1" />
            <span>Google Drive</span>
          </button>

          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center">
              <ChevronLeft className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
              <button
                onClick={() => navigateToFolder(crumb.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  index === breadcrumbs.length - 1
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Folder className="w-4 h-4 ml-1" />
                <span>{crumb.name}</span>
              </button>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {/* Change Folders Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowFolderPicker(true)}
          >
            <FolderSync className="w-4 h-4" />
            שינוי תיקיות
          </Button>

          {/* Settings toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setShowSettings((v) => !v)}
            title="הגדרות Google Drive"
            aria-label="הגדרות Google Drive"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {viewModes.map(({ mode, icon, label }) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-3",
                  viewMode === mode
                    ? "bg-white shadow-sm text-foreground"
                    : "hover:bg-white/50",
                )}
                onClick={() => setViewMode(mode)}
                title={label}
                aria-label={label}
                aria-pressed={viewMode === mode}
              >
                {icon}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* File Type Filter Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="סינון לפי סוג קובץ">
        {FILE_FILTERS.map((filter) => {
          const count = fileCounts[filter.id] || 0;
          const isActive = fileFilter === filter.id;
          if (count === 0 && filter.id !== "all" && filter.id !== "folders")
            return null;
          return (
            <Button
              key={filter.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 gap-2 transition-all",
                isActive
                  ? "bg-[#4f95ff] text-white shadow-md border-[#4f95ff]"
                  : "hover:bg-muted/80",
                !isActive && filter.color,
              )}
              onClick={() => setFileFilter(filter.id)}
              role="tab"
              id={`tab-${filter.id}`}
              aria-selected={isActive}
            >
              {filter.icon}
              <span>{filter.label}</span>
              <span
                className={cn(
                  "min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-medium px-1.5",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Content */}
      <h2 className="sr-only">תוכן Google Drive</h2>
      <div className="min-h-[200px]" role="tabpanel" aria-labelledby={`tab-${fileFilter}`} aria-live="polite">
        {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Cloud className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">
              {!driveFolderId
                ? "לא נבחרו תיקיות"
                : "התיקייה ריקה"}
            </h3>
            <p className="text-muted-foreground">
              {!driveFolderId
                ? "בחר תיקיות מ-Google Drive כדי להציג את הקבצים שלך"
                : "אין קבצים או תיקיות בתיקייה זו"}
            </p>
            {!driveFolderId && (
              <Button
                className="mt-4 bg-[#4f95ff] hover:bg-[#4f95ff]/90"
                onClick={() => setShowFolderPicker(true)}
              >
                בחר תיקיות
              </Button>
            )}
          </div>
        ) : (
          <>
            {viewMode === "grid" && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder as any}
                    baseUrl="/files"
                    source="google-drive"
                    onNavigate={() => navigateToFolder(folder.id)}
                  />
                ))}
                {filteredFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file as any}
                    viewMode="grid"
                    source="google-drive"
                  />
                ))}
              </div>
            )}

            {viewMode === "list" && (
              <div className="space-y-2">
                {filteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder as any}
                    baseUrl="/files"
                    viewMode="list"
                    source="google-drive"
                    onNavigate={() => navigateToFolder(folder.id)}
                  />
                ))}
                {filteredFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file as any}
                    viewMode="list"
                    source="google-drive"
                  />
                ))}
              </div>
            )}

            {viewMode === "compact" && (
              <div className="border rounded-lg overflow-hidden" role="table" aria-label="רשימת קבצים">
                <div role="rowgroup">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b text-right" role="row">
                    <div className="col-span-6" role="columnheader">שם</div>
                    <div className="col-span-2" role="columnheader">גודל</div>
                    <div className="col-span-3" role="columnheader">תאריך שינוי</div>
                    <div className="col-span-1" role="columnheader"><span className="sr-only">פעולות</span></div>
                  </div>
                </div>
                <div className="divide-y" role="rowgroup">
                  {filteredFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder as any}
                      baseUrl="/files"
                      viewMode="compact"
                      source="google-drive"
                      onNavigate={() => navigateToFolder(folder.id)}
                    />
                  ))}
                  {filteredFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file as any}
                      viewMode="compact"
                      source="google-drive"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Load More */}
            {nextPageToken && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="gap-2"
                >
                  {isLoadingMore && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  טען עוד
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Folder Picker Modal */}
      <DriveFolderPickerModal
        open={showFolderPicker}
        onOpenChange={setShowFolderPicker}
        email={status.email || ""}
        initialSelected={
          status.selectedFolders?.map((f) => ({
            id: f.driveFolderId,
            name: f.folderName,
          })) || []
        }
        onSaved={onStatusChange}
      />
    </div>
  );
}
