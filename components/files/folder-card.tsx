"use client";

import { deleteFolder, renameFolder } from "@/app/actions/storage";
import {
  Folder as FolderIcon,
  MoreVertical,
  Trash2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface FolderCardProps {
  folder: {
    id: number;
    name: string;
    _count: { files: number };
    totalSize?: number;
    createdAt?: string;
    updatedAt?: string;
  };
  baseUrl: string;
  viewMode?: "grid" | "list" | "compact";
  isDragOver?: boolean;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}

export function FolderCard({
  folder,
  baseUrl,
  viewMode = "grid",
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm("Are you sure you want to delete this folder? It must be empty.")
    )
      return;

    setIsDeleting(true);
    try {
      await deleteFolder(folder.id);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === folder.name) {
      setIsRenameOpen(false);
      return;
    }

    setIsRenaming(true);
    try {
      await renameFolder(folder.id, newName.trim());
      router.refresh();
      setIsRenameOpen(false);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsRenaming(false);
    }
  };

  const openRenameDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNewName(folder.name);
    setIsRenameOpen(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOver?.();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragLeave?.();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop?.();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return "Empty";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (date?: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Grid View
  if (viewMode === "grid") {
    return (
      <>
        <Link
          href={`${baseUrl}?folderId=${folder.id}`}
          className="block group"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={cn(
              "relative p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card",
              isDragOver && "ring-2 ring-primary bg-primary/10 scale-105"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <FolderIcon className="w-6 h-6" fill="currentColor" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openRenameDialog}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Rename
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
            </div>
            <div className="mt-4">
              <h3 className="font-medium truncate" title={folder.name}>
                {folder.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {folder._count.files} files • {formatSize(folder.totalSize)}
              </p>
            </div>

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-xl pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  Drop here
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Rename Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="folderName">Folder Name</Label>
                <Input
                  id="folderName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter folder name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRename();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRename}
                disabled={isRenaming || !newName.trim()}
              >
                {isRenaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // List View
  if (viewMode === "list") {
    return (
      <>
        <Link
          href={`${baseUrl}?folderId=${folder.id}`}
          className="block group"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={cn(
              "flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card relative",
              isDragOver && "ring-2 ring-primary bg-primary/10 scale-[1.02]"
            )}
          >
            <div className="w-4" />
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
              <FolderIcon className="w-6 h-6" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate" title={folder.name}>
                {folder.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Folder</p>
            </div>

            <div className="text-sm text-muted-foreground w-24 text-right shrink-0">
              {formatSize(folder.totalSize)}
            </div>

            <div className="text-sm text-muted-foreground w-20 text-right shrink-0">
              {folder._count.files} files
            </div>

            <div className="text-sm text-muted-foreground w-28 shrink-0">
              {formatDate(folder.updatedAt)}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openRenameDialog}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
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

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-xl pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  Drop here
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Rename Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="folderNameList">Folder Name</Label>
                <Input
                  id="folderNameList"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter folder name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRename();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRename}
                disabled={isRenaming || !newName.trim()}
              >
                {isRenaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Compact View (Table Row)
  if (viewMode === "compact") {
    return (
      <>
        <Link
          href={`${baseUrl}?folderId=${folder.id}`}
          className="block group"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={cn(
              "grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-all items-center relative",
              isDragOver && "bg-primary/10"
            )}
          >
            <div className="col-span-6 flex items-center gap-3 min-w-0">
              <div className="w-4" />
              <FolderIcon
                className="w-4 h-4 text-blue-600 shrink-0"
                fill="currentColor"
              />
              <span className="truncate font-medium" title={folder.name}>
                {folder.name}
              </span>
            </div>

            <div className="col-span-2 text-sm text-muted-foreground">
              {formatSize(folder.totalSize)}
            </div>

            <div className="col-span-3 text-sm text-muted-foreground">
              {formatDate(folder.updatedAt)}
            </div>

            <div className="col-span-1 flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openRenameDialog}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Rename
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
            </div>

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  Drop here
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Rename Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="folderNameCompact">Folder Name</Label>
                <Input
                  id="folderNameCompact"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter folder name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRename();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRename}
                disabled={isRenaming || !newName.trim()}
              >
                {isRenaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
