"use client";

import { deleteFile, updateFile } from "@/app/actions/storage";
import { File as FileModel } from "@prisma/client";
import {
  FileText,
  Image as ImageIcon,
  Music,
  File as FileIcon,
  MoreVertical,
  Trash2,
  Download,
  ExternalLink,
  GripVertical,
  Pencil,
  Check,
  X,
} from "lucide-react";
import NextImage from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatFileSize } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { FilePreviewModal } from "./file-preview-modal";
import { MoveToFolderDialog } from "./move-to-folder-dialog";
import { FolderInput } from "lucide-react";

// Secure download function that uses API route
const downloadFile = async (fileId: number, fileName: string) => {
  try {
    const response = await fetch(`/api/files/${fileId}/download`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to download file");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    toast.error(getUserFriendlyError(error));
  }
};

function ImageThumbnail({
  url,
  alt,
  size = "md",
}: {
  url: string;
  alt: string;
  size?: "sm" | "md" | "lg";
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    if (size === "lg") {
      return (
        <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-[#a24ec1]" />
        </div>
      );
    }
    const className = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    return <ImageIcon className={cn(className, "text-[#a24ec1]")} />;
  }

  const config = {
    sm: { container: "w-5 h-5", sizes: "20px" },
    md: { container: "w-10 h-10", sizes: "40px" },
    lg: { container: "w-full aspect-square", sizes: "200px" },
  }[size];

  return (
    <div className={cn(config.container, "relative rounded-lg overflow-hidden shrink-0 bg-muted")}>
      {isLoading && <Skeleton className="absolute inset-0" />}
      <NextImage
        src={url}
        alt={alt}
        fill
        className="object-cover"
        sizes={config.sizes}
        onLoad={() => setIsLoading(false)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

interface FileCardProps {
  file: FileModel;
  viewMode?: "grid" | "list" | "compact";
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  source?: "internal" | "google-drive";
  availableFolders?: { id: number; name: string }[];
  currentFolderId?: number | null;
}

// Drive file download function
const downloadDriveFile = async (fileId: string, fileName: string) => {
  try {
    const response = await fetch(
      `/api/integrations/google/drive/files/${fileId}/download`,
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to download file");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    toast.error(getUserFriendlyError(error));
  }
};

export function FileCard({
  file,
  viewMode = "grid",
  onDragStart,
  onDragEnd,
  isDragging = false,
  source = "internal",
  availableFolders,
  currentFolderId,
}: FileCardProps) {
  const isDrive = source === "google-drive";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(
    (file as any).displayName || "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!(await showConfirm("האם אתה בטוח שברצונך למחוק קובץ זה?"))) return;

    setIsDeleting(true);
    try {
      await deleteFile(file.id);
      toast.success("הקובץ נמחק בהצלחה");
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveDisplayName = async () => {
    setIsSaving(true);
    try {
      await updateFile(file.id, {
        displayName: editDisplayName.trim() || null,
      });
      toast.success("שם הקובץ עודכן בהצלחה");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const isImage = file.type.includes("image");
  const fileUrl = (file as any).url as string | undefined;

  const getIcon = (size: "sm" | "md" = "md") => {
    const className = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    if (isImage && fileUrl)
      return (
        <ImageThumbnail
          url={fileUrl}
          alt={(file as any).displayName || file.name}
          size={size}
        />
      );
    if (isImage)
      return <ImageIcon className={cn(className, "text-[#a24ec1]")} />;
    if (file.type.includes("pdf"))
      return <FileText className={cn(className, "text-red-500")} />;
    if (file.type.includes("audio"))
      return <Music className={cn(className, "text-[#4f95ff]")} />;
    return <FileIcon className={cn(className, "text-gray-500")} />;
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDrive) {
      downloadDriveFile(file.id as any, (file as any).displayName || file.name);
    } else {
      downloadFile(file.id as any, (file as any).displayName || file.name);
    }
  };

  const openUrl = isDrive
    ? (file as any).webViewLink || (file as any).url
    : (file as any).url;

  const sourceLabel = isDrive ? "Google Drive" : ((file as any).source || "ידנית");

  const ActionsMenu = ({ align = "end" }: { align?: "start" | "end" }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 hover:bg-muted rounded-md transition-opacity"
          onClick={(e) => e.stopPropagation()}
          aria-label={`תפריט פעולות - ${(file as any).displayName || file.name}`}
        >
          <MoreVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="text-right">
        {isDrive ? (
          openUrl && (
            <DropdownMenuItem asChild className="gap-2">
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <ExternalLink className="w-4 h-4 ml-2" />
                פתח
              </a>
            </DropdownMenuItem>
          )
        ) : (
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewOpen(true);
            }}
          >
            <ExternalLink className="w-4 h-4 ml-2" />
            פתח
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
        >
          <Download className="w-4 h-4 ml-2" />
          הורד
        </DropdownMenuItem>
        {!isDrive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setEditDisplayName((file as any).displayName || "");
                setIsEditing(true);
              }}
            >
              <Pencil className="w-4 h-4 ml-2" />
              ערוך שם
            </DropdownMenuItem>
            {availableFolders && (
              <DropdownMenuItem
                className="gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoveDialogOpen(true);
                }}
              >
                <FolderInput className="w-4 h-4 ml-2" />
                העבר לתיקייה
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4 ml-2" />
              מחק
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const previewModal = !isDrive && (
    <FilePreviewModal
      file={file}
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      onDownload={() => {
        handleDownload();
        setPreviewOpen(false);
      }}
    />
  );

  const moveDialog = !isDrive && availableFolders && (
    <MoveToFolderDialog
      open={moveDialogOpen}
      onOpenChange={setMoveDialogOpen}
      fileId={file.id}
      fileName={(file as any).displayName || file.name}
      folders={availableFolders}
      currentFolderId={currentFolderId ?? null}
    />
  );

  // Grid View
  if (viewMode === "grid") {
    return (
      <div
        draggable={!isEditing && !isDrive}
        onDragStart={(e) => {
          if (isDrive) return;
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card flex flex-col justify-between text-right",
          !isDrive && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 scale-95 ring-2 ring-primary",
          isEditing && "cursor-default",
        )}
        dir="rtl"
      >
        {isImage && fileUrl ? (
          <div className="relative -mx-4 -mt-4 mb-2">
            <ImageThumbnail
              url={fileUrl}
              alt={(file as any).displayName || file.name}
              size="lg"
            />
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10">
              <ActionsMenu align="start" />
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="p-2 rounded-lg bg-muted">{getIcon()}</div>
            <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <ActionsMenu align="start" />
            </div>
          </div>
        )}

        {isEditing ? (
          // Edit Mode
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label htmlFor={`edit-display-name-${file.id}`} className="text-xs text-muted-foreground">
                שם לתצוגה:
              </label>
              <input
                id={`edit-display-name-${file.id}`}
                type="text"
                placeholder={file.name}
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="w-full text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDisplayName();
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                שם מקורי: {file.name}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                disabled={isSaving}
              >
                <X className="w-3 h-3" />
                ביטול
              </button>
              <button
                onClick={handleSaveDisplayName}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                disabled={isSaving}
              >
                <Check className="w-3 h-3" />
                {isSaving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        ) : (
          // Normal Mode
          <>
            <div className="mt-4">
              <h3
                className="font-medium truncate"
                title={(file as any).displayName || file.name}
              >
                {(file as any).displayName || file.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {formatFileSize(file.size)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(file.createdAt)}
              </p>
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">מקור: </span>
                {(file as any).record ? (
                  <a
                    href={`/tables/${(file as any).record.tableId}?q=&page=1`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    רשומה #{(file as any).record.recordNumber} בטבלת{" "}
                    {(file as any).record.tableName}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{sourceLabel}</span>
                )}
              </div>
            </div>

            {/* Direct action buttons */}
            <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              {isDrive ? (
                openUrl && (
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    פתח
                  </a>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  פתח
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownload()}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-[#4f95ff]/10 text-[#4f95ff] rounded-md hover:bg-[#4f95ff]/20 transition-colors"
              >
                <Download className="w-3 h-3" />
                הורד
              </button>
            </div>
          </>
        )}
        {previewModal}
        {moveDialog}
      </div>
    );
  }

  // List View
  if (viewMode === "list") {
    return (
      <div
        draggable={!isDrive}
        onDragStart={(e) => {
          if (isDrive) return;
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card text-right",
          !isDrive && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 scale-[0.98] ring-2 ring-primary",
        )}
        dir="rtl"
      >
        {!isDrive && (
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" aria-hidden="true" />
        )}

        <div
          className={cn(
            "rounded-lg bg-muted shrink-0",
            isImage && fileUrl ? "overflow-hidden" : "p-2",
          )}
        >
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className="font-medium truncate"
            title={(file as any).displayName || file.name}
          >
            {(file as any).displayName || file.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {file.type.split("/")[1]?.toUpperCase() || "קובץ"}
          </p>
          <div className="text-xs mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">מקור:</span>
            {(file as any).record ? (
              <a
                href={`/tables/${(file as any).record.tableId}`}
                className="text-primary hover:underline flex items-center gap-1"
              >
                רשומה #{(file as any).record.recordNumber} בטבלת{" "}
                {(file as any).record.tableName}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">{sourceLabel}</span>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground w-20 text-left shrink-0">
          {formatFileSize(file.size)}
        </div>

        <div className="text-sm text-muted-foreground w-28 shrink-0 text-left">
          {formatDate(file.createdAt)}
        </div>

        {/* Direct action buttons */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
          {isDrive ? (
            openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="פתח"
                aria-label="פתח"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )
          ) : (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="פתח"
              aria-label="פתח"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDownload()}
            className="p-1.5 rounded-md bg-[#4f95ff]/10 text-[#4f95ff] hover:bg-[#4f95ff]/20 transition-colors"
            title="הורד"
            aria-label="הורד"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
          <ActionsMenu />
        </div>
        {previewModal}
        {moveDialog}
      </div>
    );
  }

  // Compact View (Table Row)
  if (viewMode === "compact") {
    return (
      <div
        draggable={!isDrive}
        onDragStart={(e) => {
          if (isDrive) return;
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-all items-center text-right",
          !isDrive && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 bg-primary/10",
        )}
        dir="rtl"
        role="row"
      >
        <div className="col-span-6 flex items-center gap-3 min-w-0" role="cell">
          {!isDrive && (
            <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0" aria-hidden="true" />
          )}
          {getIcon("sm")}
          <div className="flex flex-col min-w-0">
            <span
              className="truncate font-medium"
              title={(file as any).displayName || file.name}
            >
              {(file as any).displayName || file.name}
            </span>
            {(file as any).record ? (
              <a
                href={`/tables/${(file as any).record.tableId}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                רשומה #{(file as any).record.recordNumber} בטבלת{" "}
                {(file as any).record.tableName}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">מקור: {(file as any).source || "ידנית"}</span>
            )}
          </div>
        </div>

        <div className="col-span-2 text-sm text-muted-foreground text-left" role="cell">
          {formatFileSize(file.size)}
        </div>

        <div className="col-span-3 text-sm text-muted-foreground text-left" role="cell">
          {formatDate(file.createdAt)}
        </div>

        <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" role="cell">
          <ActionsMenu />
        </div>
        {previewModal}
        {moveDialog}
      </div>
    );
  }

  return null;
}
