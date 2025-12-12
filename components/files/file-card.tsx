"use client";

import { deleteFile } from "@/app/actions/storage";
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
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    setIsDeleting(true);
    try {
      await deleteFile(file.id);
    } catch (error) {
      console.error(error);
      alert("Failed to delete file");
    } finally {
      setIsDeleting(false);
    }
  };

  const getIcon = (size: "sm" | "md" = "md") => {
    const className = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    if (file.type.includes("image"))
      return <ImageIcon className={cn(className, "text-purple-600")} />;
    if (file.type.includes("pdf"))
      return <FileText className={cn(className, "text-red-600")} />;
    if (file.type.includes("audio"))
      return <Music className={cn(className, "text-yellow-600")} />;
    return <FileIcon className={cn(className, "text-gray-600")} />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
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
      <DropdownMenuContent align={align}>
        <DropdownMenuItem asChild>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={file.url} download className="flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Download
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Grid View
  if (viewMode === "grid") {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card flex flex-col justify-between cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 scale-95 ring-2 ring-primary"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="p-2 rounded-lg bg-muted">{getIcon()}</div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionsMenu />
          </div>
        </div>

        <div className="mt-4">
          <h3 className="font-medium truncate" title={file.name}>
            {file.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {formatSize(file.size)} • {formatDate(file.createdAt)}
          </p>
        </div>
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
          "group flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 scale-[0.98] ring-2 ring-primary"
        )}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="p-2 rounded-lg bg-muted shrink-0">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate" title={file.name}>
            {file.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {file.type.split("/")[1]?.toUpperCase() || "FILE"}
          </p>
        </div>

        <div className="text-sm text-muted-foreground w-20 text-right shrink-0">
          {formatSize(file.size)}
        </div>

        <div className="text-sm text-muted-foreground w-28 shrink-0">
          {formatDate(file.createdAt)}
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
          "group grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-all cursor-grab active:cursor-grabbing items-center",
          isDragging && "opacity-50 bg-primary/10"
        )}
      >
        <div className="col-span-6 flex items-center gap-3 min-w-0">
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          {getIcon("sm")}
          <span className="truncate font-medium" title={file.name}>
            {file.name}
          </span>
        </div>

        <div className="col-span-2 text-sm text-muted-foreground">
          {formatSize(file.size)}
        </div>

        <div className="col-span-3 text-sm text-muted-foreground">
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
