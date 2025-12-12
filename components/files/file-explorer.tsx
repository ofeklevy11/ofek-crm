"use client";

import { useState, useMemo } from "react";
import { FolderCard } from "./folder-card";
import { FileCard } from "./file-card";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Home,
  LayoutGrid,
  List,
  Table2,
  Files,
  Folder,
  Image,
  FileText,
  Music,
  FileVideo,
  FileCode,
  File,
} from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { moveFileToFolder } from "@/app/actions/storage";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

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

interface FileExplorerProps {
  data: {
    folders: any[];
    files: any[];
    totalUsage: number;
    breadcrumbs: { id: number; name: string }[];
  };
  currentFolderId: number | null;
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
    label: "All Files",
    icon: <Files className="w-4 h-4" />,
    color: "text-gray-600",
  },
  {
    id: "folders",
    label: "Folders",
    icon: <Folder className="w-4 h-4" />,
    color: "text-blue-600",
  },
  {
    id: "images",
    label: "Images",
    icon: <Image className="w-4 h-4" />,
    color: "text-purple-600",
    match: (type) => type.includes("image"),
  },
  {
    id: "pdf",
    label: "PDF",
    icon: <FileText className="w-4 h-4" />,
    color: "text-red-600",
    match: (type) => type.includes("pdf"),
  },
  {
    id: "audio",
    label: "Audio",
    icon: <Music className="w-4 h-4" />,
    color: "text-yellow-600",
    match: (type) => type.includes("audio"),
  },
  {
    id: "video",
    label: "Video",
    icon: <FileVideo className="w-4 h-4" />,
    color: "text-pink-600",
    match: (type) => type.includes("video"),
  },
  {
    id: "documents",
    label: "Documents",
    icon: <FileCode className="w-4 h-4" />,
    color: "text-green-600",
    match: (type) =>
      type.includes("text") ||
      type.includes("document") ||
      type.includes("spreadsheet") ||
      type.includes("word") ||
      type.includes("excel"),
  },
  {
    id: "other",
    label: "Other",
    icon: <File className="w-4 h-4" />,
    color: "text-gray-500",
    match: (type) => true, // Catches everything else
  },
];

export function FileExplorer({ data, currentFolderId }: FileExplorerProps) {
  const { folders, files, totalUsage, breadcrumbs } = data;
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [draggedFileId, setDraggedFileId] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);
  const router = useRouter();

  const maxStorage = 100 * 1024 * 1024; // 100MB
  const usagePercent = Math.min((totalUsage / maxStorage) * 100, 100);

  // Filter files based on selected filter
  const filteredFiles = useMemo(() => {
    if (fileFilter === "all" || fileFilter === "folders") return files;

    const filterConfig = FILE_FILTERS.find((f) => f.id === fileFilter);
    if (!filterConfig?.match) return files;

    // For "other", we need to exclude files that match any other filter
    if (fileFilter === "other") {
      const otherFilters = FILE_FILTERS.filter(
        (f) =>
          f.id !== "all" && f.id !== "folders" && f.id !== "other" && f.match
      );
      return files.filter(
        (file: any) => !otherFilters.some((f) => f.match!(file.type))
      );
    }

    return files.filter((file: any) => filterConfig.match!(file.type));
  }, [files, fileFilter]);

  // Show folders only when "all" or "folders" filter is selected
  const showFolders = fileFilter === "all" || fileFilter === "folders";
  const filteredFolders = showFolders ? folders : [];

  // Count files by type for badges
  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: files.length + folders.length,
      folders: folders.length,
    };

    FILE_FILTERS.forEach((filter) => {
      if (filter.match && filter.id !== "other") {
        counts[filter.id] = files.filter((file: any) =>
          filter.match!(file.type)
        ).length;
      }
    });

    // Calculate "other" count
    const knownTypesCount = Object.entries(counts)
      .filter(([key]) => key !== "all" && key !== "folders" && key !== "other")
      .reduce((sum, [, count]) => sum + count, 0);
    counts.other = files.length - knownTypesCount;

    return counts;
  }, [files, folders]);

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleDragStart = (fileId: number) => {
    setDraggedFileId(fileId);
  };

  const handleDragEnd = () => {
    setDraggedFileId(null);
    setDragOverFolderId(null);
  };

  const handleDragOverFolder = (folderId: number) => {
    if (draggedFileId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolderId(null);
  };

  const handleDropOnFolder = async (targetFolderId: number) => {
    if (draggedFileId) {
      try {
        await moveFileToFolder(draggedFileId, targetFolderId);
        router.refresh();
      } catch (error: any) {
        alert(`Failed to move file: ${error.message}`);
      }
    }
    setDraggedFileId(null);
    setDragOverFolderId(null);
  };

  const handleDropOnBreadcrumb = async (targetFolderId: number | null) => {
    if (draggedFileId) {
      try {
        await moveFileToFolder(draggedFileId, targetFolderId);
        router.refresh();
      } catch (error: any) {
        alert(`Failed to move file: ${error.message}`);
      }
    }
    setDraggedFileId(null);
  };

  const viewModes: { mode: ViewMode; icon: React.ReactNode; label: string }[] =
    [
      { mode: "grid", icon: <LayoutGrid className="w-4 h-4" />, label: "Grid" },
      { mode: "list", icon: <List className="w-4 h-4" />, label: "List" },
      {
        mode: "compact",
        icon: <Table2 className="w-4 h-4" />,
        label: "Compact",
      },
    ];

  return (
    <div className="space-y-6">
      {/* Location Banner - Shows when inside a folder */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Location</p>
              <h2 className="text-lg font-semibold text-foreground">
                {breadcrumbs[breadcrumbs.length - 1]?.name || "Files"}
              </h2>
            </div>
          </div>
          <Link href="/files">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-white dark:bg-gray-900 hover:bg-gray-50"
            >
              <Home className="w-4 h-4" />
              Back to Library
            </Button>
          </Link>
        </div>
      )}

      {/* Breadcrumbs and Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b">
        {/* Enhanced Breadcrumbs */}
        <nav className="flex items-center gap-1">
          <Link
            href="/files"
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              breadcrumbs.length === 0
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
              draggedFileId &&
                "bg-blue-100 border-2 border-dashed border-blue-400"
            )}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnBreadcrumb(null);
            }}
          >
            <Home className="w-4 h-4" />
            <span>All Files</span>
          </Link>

          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center">
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              <Link
                href={`/files?folderId=${crumb.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  index === breadcrumbs.length - 1
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  draggedFileId &&
                    index < breadcrumbs.length - 1 &&
                    "bg-blue-100 border-2 border-dashed border-blue-400"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (index < breadcrumbs.length - 1) {
                    handleDropOnBreadcrumb(crumb.id);
                  }
                }}
              >
                <Folder className="w-4 h-4" />
                <span>{crumb.name}</span>
              </Link>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-4">
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
                    : "hover:bg-white/50"
                )}
                onClick={() => setViewMode(mode)}
                title={label}
              >
                {icon}
              </Button>
            ))}
          </div>

          {/* Storage Usage */}
          <div className="w-48">
            <div className="flex justify-between text-xs mb-1">
              <span>Storage</span>
              <span
                className={usagePercent > 90 ? "text-red-500 font-bold" : ""}
              >
                {formatSize(totalUsage)} / 100 MB
              </span>
            </div>
            <Progress
              value={usagePercent}
              className={`h-2 ${
                usagePercent > 90 ? "bg-red-100 [&>div]:bg-red-500" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* File Type Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {FILE_FILTERS.map((filter) => {
          const count = fileCounts[filter.id] || 0;
          const isActive = fileFilter === filter.id;

          // Hide filter if no files of this type exist (except for "all" and "folders")
          if (count === 0 && filter.id !== "all" && filter.id !== "folders") {
            return null;
          }

          return (
            <Button
              key={filter.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 gap-2 transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-muted/80",
                !isActive && filter.color
              )}
              onClick={() => setFileFilter(filter.id)}
            >
              {filter.icon}
              <span>{filter.label}</span>
              <span
                className={cn(
                  "min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-medium px-1.5",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
              {fileFilter === "folders" ? (
                <Folder className="w-8 h-8 text-muted-foreground" />
              ) : fileFilter !== "all" ? (
                FILE_FILTERS.find((f) => f.id === fileFilter)?.icon || (
                  <Home className="w-8 h-8 text-muted-foreground" />
                )
              ) : (
                <Home className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-medium">
              {fileFilter === "all"
                ? "This folder is empty"
                : fileFilter === "folders"
                ? "No folders found"
                : `No ${
                    FILE_FILTERS.find(
                      (f) => f.id === fileFilter
                    )?.label.toLowerCase() || "files"
                  } found`}
            </h3>
            <p className="text-muted-foreground">
              {fileFilter === "all"
                ? "Start by uploading files or creating a folder."
                : "Try selecting a different filter."}
            </p>
          </div>
        ) : (
          <>
            {viewMode === "grid" && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    baseUrl="/files"
                    isDragOver={dragOverFolderId === folder.id}
                    onDragOver={() => handleDragOverFolder(folder.id)}
                    onDragLeave={handleDragLeaveFolder}
                    onDrop={() => handleDropOnFolder(folder.id)}
                  />
                ))}
                {filteredFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    viewMode="grid"
                    onDragStart={() => handleDragStart(file.id)}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedFileId === file.id}
                  />
                ))}
              </div>
            )}

            {viewMode === "list" && (
              <div className="space-y-2">
                {filteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    baseUrl="/files"
                    viewMode="list"
                    isDragOver={dragOverFolderId === folder.id}
                    onDragOver={() => handleDragOverFolder(folder.id)}
                    onDragLeave={handleDragLeaveFolder}
                    onDrop={() => handleDropOnFolder(folder.id)}
                  />
                ))}
                {filteredFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    viewMode="list"
                    onDragStart={() => handleDragStart(file.id)}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedFileId === file.id}
                  />
                ))}
              </div>
            )}

            {viewMode === "compact" && (
              <div className="border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
                  <div className="col-span-6">Name</div>
                  <div className="col-span-2">Size</div>
                  <div className="col-span-3">Modified</div>
                  <div className="col-span-1"></div>
                </div>
                {/* Items */}
                <div className="divide-y">
                  {filteredFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      baseUrl="/files"
                      viewMode="compact"
                      isDragOver={dragOverFolderId === folder.id}
                      onDragOver={() => handleDragOverFolder(folder.id)}
                      onDragLeave={handleDragLeaveFolder}
                      onDrop={() => handleDropOnFolder(folder.id)}
                    />
                  ))}
                  {filteredFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      viewMode="compact"
                      onDragStart={() => handleDragStart(file.id)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggedFileId === file.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
