"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronLeft,
  Folder,
  HardDrive,
  Loader2,
  Share2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface SelectedFolder {
  id: string;
  name: string;
}

interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
  isLoaded?: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
}

interface DriveFolderPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  initialSelected?: SelectedFolder[];
  onSaved: () => void;
}

interface SectionState {
  myDrive: FolderNode[];
  sharedDrives: FolderNode[];
  sharedWithMe: FolderNode[];
}

const EMPTY_SECTIONS: SectionState = { myDrive: [], sharedDrives: [], sharedWithMe: [] };

const MAX_FOLDERS = 20;

type SectionKey = keyof SectionState;

const SECTION_CONFIG: { key: SectionKey; label: string; Icon: typeof HardDrive }[] = [
  { key: "myDrive", label: "הדרייב שלי", Icon: HardDrive },
  { key: "sharedDrives", label: "דרייבים משותפים", Icon: Users },
  { key: "sharedWithMe", label: "שותף איתי", Icon: Share2 },
];

export function DriveFolderPickerModal({
  open,
  onOpenChange,
  email,
  initialSelected = [],
  onSaved,
}: DriveFolderPickerModalProps) {
  const [sections, setSections] = useState<SectionState>(EMPTY_SECTIONS);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    myDrive: false,
    sharedDrives: false,
    sharedWithMe: false,
  });
  const [selected, setSelected] = useState<SelectedFolder[]>(initialSelected);
  const [isRootLoaded, setIsRootLoaded] = useState(false);
  const [isRootLoading, setIsRootLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadSubfolders = useCallback(
    async (parentId: string): Promise<FolderNode[]> => {
      const res = await fetch(
        `/api/integrations/google/drive/folders?parentId=${parentId}`,
      );
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();
      return (data.folders || []).map((f: { id: string; name: string }) => ({
        id: f.id,
        name: f.name,
        isLoaded: false,
        isLoading: false,
        isExpanded: false,
      }));
    },
    [],
  );

  const loadRootFolders = useCallback(async () => {
    setIsRootLoading(true);
    setHasError(false);
    try {
      const res = await fetch(
        `/api/integrations/google/drive/folders?parentId=root`,
      );
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();

      const toNodes = (items: { id: string; name: string }[]): FolderNode[] =>
        items.map((f) => ({
          id: f.id,
          name: f.name,
          isLoaded: false,
          isLoading: false,
          isExpanded: false,
        }));

      if (data.sections) {
        setSections({
          myDrive: toNodes(data.sections.myDrive || []),
          sharedDrives: toNodes(data.sections.sharedDrives || []),
          sharedWithMe: toNodes(data.sections.sharedWithMe || []),
        });
      } else {
        setSections({
          myDrive: toNodes(data.folders || []),
          sharedDrives: [],
          sharedWithMe: [],
        });
      }
      setIsRootLoaded(true);
    } catch {
      setHasError(true);
      toast.error("שגיאה בטעינת תיקיות");
    } finally {
      setIsRootLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !isRootLoaded && !isRootLoading) {
      loadRootFolders();
    }
    if (open) {
      setSelected(initialSelected);
    }
  }, [open]);

  const allFolders = [...sections.myDrive, ...sections.sharedDrives, ...sections.sharedWithMe];

  const toggleExpand = useCallback(
    async (folderId: string) => {
      const updateNode = (
        nodes: FolderNode[],
        id: string,
        updater: (node: FolderNode) => FolderNode,
      ): FolderNode[] =>
        nodes.map((n) => {
          if (n.id === id) return updater(n);
          if (n.children)
            return { ...n, children: updateNode(n.children, id, updater) };
          return n;
        });

      const updateSections = (updater: (nodes: FolderNode[]) => FolderNode[]) => {
        setSections((prev) => ({
          myDrive: updater(prev.myDrive),
          sharedDrives: updater(prev.sharedDrives),
          sharedWithMe: updater(prev.sharedWithMe),
        }));
      };

      // Find the node across all sections
      const findNode = (
        nodes: FolderNode[],
        id: string,
      ): FolderNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          if (n.children) {
            const found = findNode(n.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const node = findNode(allFolders, folderId);
      if (!node) return;

      if (node.isExpanded) {
        updateSections((nodes) =>
          updateNode(nodes, folderId, (n) => ({ ...n, isExpanded: false })),
        );
        return;
      }

      if (!node.isLoaded) {
        updateSections((nodes) =>
          updateNode(nodes, folderId, (n) => ({ ...n, isLoading: true })),
        );
        try {
          const children = await loadSubfolders(folderId);
          updateSections((nodes) =>
            updateNode(nodes, folderId, (n) => ({
              ...n,
              children,
              isLoaded: true,
              isLoading: false,
              isExpanded: true,
            })),
          );
        } catch {
          updateSections((nodes) =>
            updateNode(nodes, folderId, (n) => ({ ...n, isLoading: false })),
          );
          toast.error("שגיאה בטעינת תיקיות");
        }
      } else {
        updateSections((nodes) =>
          updateNode(nodes, folderId, (n) => ({ ...n, isExpanded: true })),
        );
      }
    },
    [allFolders, loadSubfolders],
  );

  const toggleSelect = (folder: { id: string; name: string }) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === folder.id);
      if (exists) return prev.filter((s) => s.id !== folder.id);
      if (prev.length >= MAX_FOLDERS) {
        toast.error(`ניתן לבחור עד ${MAX_FOLDERS} תיקיות`);
        return prev;
      }
      return [...prev, { id: folder.id, name: folder.name }];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        "/api/integrations/google/drive/folders/select",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folders: selected }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("התיקיות נשמרו בהצלחה");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "שגיאה בשמירת תיקיות");
    } finally {
      setIsSaving(false);
    }
  };

  const renderFolder = (node: FolderNode, depth: number = 0) => {
    const isSelected = selected.some((s) => s.id === node.id);

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer",
            isSelected && "bg-blue-50",
          )}
          style={{ paddingRight: `${depth * 24 + 12}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(node.id)}
            className="p-0.5 hover:bg-muted rounded shrink-0"
          >
            {node.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : node.isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelect(node)}
            className="shrink-0"
          />

          <Folder
            className="w-4 h-4 text-[#4f95ff] shrink-0"
            fill="currentColor"
          />

          <span
            className="text-sm truncate flex-1"
            onClick={() => toggleSelect(node)}
          >
            {node.name}
          </span>
        </div>

        {node.isExpanded && node.children && (
          <div>
            {node.children.length === 0 ? (
              <div
                className="text-xs text-muted-foreground py-2"
                style={{ paddingRight: `${(depth + 1) * 24 + 36}px` }}
              >
                אין תיקיות משנה
              </div>
            ) : (
              node.children.map((child) => renderFolder(child, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col text-right">
        <DialogHeader>
          <DialogTitle>בחר תיקיות מ-Google Drive</DialogTitle>
          <p className="text-sm text-muted-foreground">{email}</p>
        </DialogHeader>

        {/* Selected pills */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 border-b">
            {selected.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md"
              >
                <Folder className="w-3 h-3" />
                {s.name}
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) => prev.filter((p) => p.id !== s.id))
                  }
                  className="hover:bg-blue-100 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <span className="text-xs text-muted-foreground self-center">
              {selected.length}/{MAX_FOLDERS} תיקיות נבחרו
            </span>
          </div>
        )}

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {isRootLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : hasError ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-destructive">שגיאה בטעינת תיקיות מ-Google Drive</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsRootLoaded(false);
                  loadRootFolders();
                }}
              >
                נסה שוב
              </Button>
            </div>
          ) : allFolders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              לא נמצאו תיקיות
            </div>
          ) : (
            <div className="py-1">
              {SECTION_CONFIG.map(({ key, label, Icon }) => {
                const sectionFolders = sections[key];
                if (sectionFolders.length === 0) return null;
                const isCollapsed = collapsedSections[key];
                return (
                  <div key={key} className="mb-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    >
                      {isCollapsed ? (
                        <ChevronLeft className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                      <span className="text-xs text-muted-foreground/70">
                        ({sectionFolders.length})
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div>
                        {sectionFolders.map((f) => renderFolder(f, 1))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mr-auto flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#4f95ff] hover:bg-[#4f95ff]/90 gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            שמור ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
