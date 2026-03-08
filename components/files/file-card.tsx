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
}

export function FileCard({
  file,
  viewMode = "grid",
  onDragStart,
  onDragEnd,
  isDragging = false,
}: FileCardProps) {
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

  const ActionsMenu = ({ align = "end" }: { align?: "start" | "end" }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 hover:bg-muted rounded-md transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="text-right">
        <DropdownMenuItem asChild className="gap-2">
          <a
            href={(file as any).url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center"
          >
            <ExternalLink className="w-4 h-4 ml-2" />
            פתח
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            downloadFile(file.id, (file as any).displayName || file.name);
          }}
        >
          <Download className="w-4 h-4 ml-2" />
          הורד
        </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive gap-2"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4 ml-2" />
          מחק
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Grid View
  if (viewMode === "grid") {
    return (
      <div
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card flex flex-col justify-between cursor-grab active:cursor-grabbing text-right",
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
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <ActionsMenu align="start" />
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="p-2 rounded-lg bg-muted">{getIcon()}</div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionsMenu align="start" />
            </div>
          </div>
        )}

        {isEditing ? (
          // Edit Mode
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                שם לתצוגה:
              </label>
              <input
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
                  <span className="text-muted-foreground">{(file as any).source || "ידנית"}</span>
                )}
              </div>
            </div>

            {/* Direct action buttons */}
            <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={(file as any).url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                פתח
              </a>
              <button
                type="button"
                onClick={() =>
                  downloadFile(file.id, (file as any).displayName || file.name)
                }
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-[#4f95ff]/10 text-[#4f95ff] rounded-md hover:bg-[#4f95ff]/20 transition-colors"
              >
                <Download className="w-3 h-3" />
                הורד
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // List View
  if (viewMode === "list") {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card cursor-grab active:cursor-grabbing text-right",
          isDragging && "opacity-50 scale-[0.98] ring-2 ring-primary",
        )}
        dir="rtl"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />

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
              <span className="text-muted-foreground">{(file as any).source || "ידנית"}</span>
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
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <a
            href={(file as any).url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="פתח"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={() =>
              downloadFile(file.id, (file as any).displayName || file.name)
            }
            className="p-1.5 rounded-md bg-[#4f95ff]/10 text-[#4f95ff] hover:bg-[#4f95ff]/20 transition-colors"
            title="הורד"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <ActionsMenu />
        </div>
      </div>
    );
  }

  // Compact View (Table Row)
  if (viewMode === "compact") {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-all cursor-grab active:cursor-grabbing items-center text-right",
          isDragging && "opacity-50 bg-primary/10",
        )}
        dir="rtl"
      >
        <div className="col-span-6 flex items-center gap-3 min-w-0">
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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

        <div className="col-span-2 text-sm text-muted-foreground text-left">
          {formatFileSize(file.size)}
        </div>

        <div className="col-span-3 text-sm text-muted-foreground text-left">
          {formatDate(file.createdAt)}
        </div>

        <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionsMenu />
        </div>
      </div>
    );
  }

  return null;
}
