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
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatFileSize } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";

interface FolderCardProps {
  folder: {
    id: number | string;
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
  source?: "internal" | "google-drive";
  onNavigate?: () => void;
}

export function FolderCard({
  folder,
  baseUrl,
  viewMode = "grid",
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  source = "internal",
  onNavigate,
}: FolderCardProps) {
  const isDrive = source === "google-drive";
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !(await showConfirm(
        "האם אתה בטוח שברצונך למחוק תיקייה זו? התיקייה חייבת להיות ריקה.",
      ))
    )
      return;

    setIsDeleting(true);
    try {
      await deleteFolder(folder.id as number);
      toast.success("התיקייה נמחקה בהצלחה");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
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
      await renameFolder(folder.id as number, newName.trim());
      toast.success("שם התיקייה עודכן בהצלחה");
      router.refresh();
      setIsRenameOpen(false);
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
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
    if (!bytes || bytes === 0) return "ריק";
    return formatFileSize(bytes);
  };

  const formatDate = (date?: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("he-IL", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const folderHref = isDrive ? "#" : `${baseUrl}?folderId=${folder.id}`;
  const handleClick = isDrive
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        onNavigate?.();
      }
    : undefined;

  // Grid View
  if (viewMode === "grid") {
    return (
      <>
        <Link
          href={folderHref}
          prefetch={false}
          className="block group"
          onClick={handleClick}
          onDragOver={isDrive ? undefined : handleDragOver}
          onDragLeave={isDrive ? undefined : handleDragLeave}
          onDrop={isDrive ? undefined : handleDrop}
        >
          <div
            className={cn(
              "relative p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card text-right",
              !isDrive && isDragOver && "ring-2 ring-primary bg-primary/10 scale-105",
            )}
            dir="rtl"
          >
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg bg-blue-100 text-[#4f95ff]">
                <FolderIcon className="w-6 h-6" fill="currentColor" aria-hidden="true" />
              </div>
              {!isDrive && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      aria-label={`תפריט פעולות - ${folder.name}`}
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-right">
                    <DropdownMenuItem
                      onClick={openRenameDialog}
                      className="gap-2"
                    >
                      <Pencil className="w-4 h-4 ml-2" />
                      שנה שם
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
              )}
            </div>
            <div className="mt-4">
              <h3 className="font-medium truncate" title={folder.name}>
                {folder.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isDrive ? "Google Drive" : `${folder._count.files} קבצים • ${formatSize(folder.totalSize)}`}
              </p>
            </div>

            {!isDrive && isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-xl pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  שחרר כאן
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        {!isDrive && (
          <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
            <DialogContent className="sm:max-w-[400px] text-right">
              <DialogHeader>
                <DialogTitle>שינוי שם תיקייה</DialogTitle>
                <DialogDescription className="sr-only">הזן שם חדש לתיקייה</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="folderName">שם התיקייה</Label>
                  <Input
                    id="folderName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="הזמן שם תיקייה"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename();
                      }
                    }}
                    className="text-right"
                  />
                </div>
              </div>
              <DialogFooter className="mr-auto flex gap-2">
                <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                  ביטול
                </Button>
                <Button
                  onClick={handleRename}
                  disabled={isRenaming || !newName.trim()}
                  className="bg-[#4f95ff] hover:bg-[#4f95ff]/90"
                >
                  {isRenaming ? "שומר..." : "שמור"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  // List View
  if (viewMode === "list") {
    return (
      <>
        <Link
          href={folderHref}
          prefetch={false}
          className="block group"
          onClick={handleClick}
          onDragOver={isDrive ? undefined : handleDragOver}
          onDragLeave={isDrive ? undefined : handleDragLeave}
          onDrop={isDrive ? undefined : handleDrop}
        >
          <div
            className={cn(
              "flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-all bg-card relative text-right",
              !isDrive && isDragOver && "ring-2 ring-primary bg-primary/10 scale-[1.02]",
            )}
            dir="rtl"
          >
            <div className="w-4" />
            <div className="p-2 rounded-lg bg-blue-100 text-[#4f95ff] shrink-0">
              <FolderIcon className="w-6 h-6" fill="currentColor" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate" title={folder.name}>
                {folder.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isDrive ? "Google Drive" : "תיקייה"}
              </p>
            </div>

            <div className="text-sm text-muted-foreground w-24 text-left shrink-0">
              {isDrive ? "-" : formatSize(folder.totalSize)}
            </div>

            <div className="text-sm text-muted-foreground w-20 text-left shrink-0">
              {isDrive ? "-" : `${folder._count.files} קבצים`}
            </div>

            <div className="text-sm text-muted-foreground w-28 shrink-0 text-left">
              {formatDate(folder.updatedAt)}
            </div>

            {!isDrive && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    aria-label={`תפריט פעולות - ${folder.name}`}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-right">
                  <DropdownMenuItem onClick={openRenameDialog} className="gap-2">
                    <Pencil className="w-4 h-4 ml-2" />
                    שנה שם
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
            )}

            {!isDrive && isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-xl pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  שחרר כאן
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        {!isDrive && (
          <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
            <DialogContent className="sm:max-w-[400px] text-right">
              <DialogHeader>
                <DialogTitle>שינוי שם תיקייה</DialogTitle>
                <DialogDescription className="sr-only">הזן שם חדש לתיקייה</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="folderNameList">שם התיקייה</Label>
                  <Input
                    id="folderNameList"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="הזן שם תיקייה"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename();
                      }
                    }}
                    className="text-right"
                  />
                </div>
              </div>
              <DialogFooter className="mr-auto flex gap-2">
                <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                  ביטול
                </Button>
                <Button
                  onClick={handleRename}
                  disabled={isRenaming || !newName.trim()}
                  className="bg-[#4f95ff] hover:bg-[#4f95ff]/90"
                >
                  {isRenaming ? "שומר..." : "שמור"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  // Compact View (Table Row)
  if (viewMode === "compact") {
    return (
      <>
        <Link
          href={folderHref}
          prefetch={false}
          className="block group"
          onClick={handleClick}
          onDragOver={isDrive ? undefined : handleDragOver}
          onDragLeave={isDrive ? undefined : handleDragLeave}
          onDrop={isDrive ? undefined : handleDrop}
        >
          <div
            className={cn(
              "grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/30 transition-all items-center relative text-right",
              !isDrive && isDragOver && "bg-primary/10",
            )}
            dir="rtl"
            role="row"
          >
            <div className="col-span-6 flex items-center gap-3 min-w-0" role="cell">
              <div className="w-4" />
              <FolderIcon
                className="w-4 h-4 text-[#4f95ff] shrink-0"
                fill="currentColor"
                aria-hidden="true"
              />
              <span className="truncate font-medium" title={folder.name}>
                {folder.name}
              </span>
            </div>

            <div className="col-span-2 text-sm text-muted-foreground text-left" role="cell">
              {isDrive ? "-" : formatSize(folder.totalSize)}
            </div>

            <div className="col-span-3 text-sm text-muted-foreground text-left" role="cell">
              {formatDate(folder.updatedAt)}
            </div>

            <div className="col-span-1 flex justify-end" role="cell">
              {!isDrive && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      aria-label={`תפריט פעולות - ${folder.name}`}
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-right">
                    <DropdownMenuItem
                      onClick={openRenameDialog}
                      className="gap-2"
                    >
                      <Pencil className="w-4 h-4 ml-2" />
                      שנה שם
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
              )}
            </div>

            {!isDrive && isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 pointer-events-none">
                <span className="text-sm font-medium text-primary">
                  שחרר כאן
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Rename Dialog - Outside Link */}
        {!isDrive && (
          <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
            <DialogContent className="sm:max-w-[400px] text-right">
              <DialogHeader>
                <DialogTitle>שינוי שם תיקייה</DialogTitle>
                <DialogDescription className="sr-only">הזן שם חדש לתיקייה</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="folderNameCompact">שם התיקייה</Label>
                  <Input
                    id="folderNameCompact"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="הזן שם תיקייה"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename();
                      }
                    }}
                    className="text-right"
                  />
                </div>
              </div>
              <DialogFooter className="mr-auto flex gap-2">
                <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                  ביטול
                </Button>
                <Button
                  onClick={handleRename}
                  disabled={isRenaming || !newName.trim()}
                  className="bg-[#4f95ff] hover:bg-[#4f95ff]/90"
                >
                  {isRenaming ? "שומר..." : "שמור"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  return null;
}
