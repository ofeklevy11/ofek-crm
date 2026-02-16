"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadFiles } from "@/lib/uploadthing";
import { UploadCloud, X, File as FileIcon, RefreshCw } from "lucide-react";
import { saveFileMetadata } from "@/app/actions/storage";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UploadFileModalProps {
  currentFolderId: number | null;
}

export function UploadFileModal({ currentFolderId }: UploadFileModalProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileDisplayNames, setFileDisplayNames] = useState<
    Record<number, string>
  >({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setFileDisplayNames({});
      setUploadProgress(0);
      setIsUploading(false);
      setIsStuck(false);
    }
  }, [open]);

  // Watch for stuck state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (uploadProgress >= 100 && isUploading) {
      timer = setTimeout(() => {
        setIsStuck(true);
      }, 3000); // 3 seconds timeout for polling skip
    }
    return () => clearTimeout(timer);
  }, [uploadProgress, isUploading]);

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setIsStuck(false);

    try {
      const res = await uploadFiles("companyFiles", {
        files,
        onUploadProgress: ({ progress }) => {
          setUploadProgress(Math.min(progress, 100));
        },
      });

      console.log("[Upload] Files uploaded:", res?.length ?? 0);

      if (res && res.length > 0) {
        await saveMetadata(res);
      } else {
        console.error("No valid response from uploadFiles");
        setIsStuck(true);
        setIsUploading(false);
      }
    } catch (e: any) {
      console.error("Upload error:", e);
      alert(`העלאה נכשלה: ${e.message}`);
      setIsStuck(true);
      setIsUploading(false);
    }
  };

  const saveMetadata = async (uploadedFiles: any[]) => {
    try {
      await Promise.all(
        uploadedFiles.map((file, index) =>
          saveFileMetadata(
            {
              name: file.name,
              url: file.url,
              key: file.key,
              size: file.size,
              type: file.type || "unknown",
              displayName: fileDisplayNames[index] || undefined,
            },
            currentFolderId,
          ),
        ),
      );

      setOpen(false);
      router.refresh();
      setIsUploading(false);
    } catch (e: any) {
      console.error("Error saving file metadata:", e);
      alert(`הקובץ הועלה לשרת אך נכשלה שמירת הרשומה: ${e.message}`);
      setIsUploading(false);
    }
  };

  const handleManualRefresh = () => {
    setOpen(false);
    router.refresh();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    // Update display names indices
    const newDisplayNames: Record<number, string> = {};
    Object.keys(fileDisplayNames).forEach((key) => {
      const idx = parseInt(key);
      if (idx < index) {
        newDisplayNames[idx] = fileDisplayNames[idx];
      } else if (idx > index) {
        newDisplayNames[idx - 1] = fileDisplayNames[idx];
      }
    });
    setFileDisplayNames(newDisplayNames);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-[#a24ec1] hover:bg-[#a24ec1]/90 text-white shadow-sm transition-all duration-200">
          <UploadCloud className="h-4 w-4" />
          העלאת קובץ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl font-semibold">
            העלאת קבצים
          </DialogTitle>
          <DialogDescription className="text-right">
            גרור ושחרר קבצים כאן או לחץ לעיון. גודל מקסימלי: 8MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Dropzone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center cursor-pointer bg-muted/30 hover:bg-muted/50",
              isDragOver
                ? "border-[#4f95ff] bg-blue-50/50"
                : "border-muted-foreground/25",
              isUploading && "pointer-events-none opacity-50",
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileSelect}
            />

            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <UploadCloud className="w-6 h-6 text-[#4f95ff]" />
            </div>

            <p className="text-sm font-medium text-foreground">
              לחץ לבחירה או גרור קבצים לכאן
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              תומך בתמונות, PDF, טקסט, שמע
            </p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground text-right">
                קבצים שנבחרו
              </h4>
              <div className="max-h-[200px] overflow-y-auto space-y-2 pl-2">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 p-3 bg-card border rounded-lg shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <div className="p-2 bg-muted rounded-md shrink-0">
                          <FileIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0 text-right flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            title={file.name}
                          >
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      {!isUploading && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(idx);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {/* Custom Display Name Input */}
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                      <span className="text-xs text-muted-foreground shrink-0">
                        שם לתצוגה:
                      </span>
                      <input
                        type="text"
                        placeholder="השאר ריק לשימוש בשם המקורי..."
                        value={fileDisplayNames[idx] || ""}
                        onChange={(e) =>
                          setFileDisplayNames((prev) => ({
                            ...prev,
                            [idx]: e.target.value,
                          }))
                        }
                        className="text-sm w-full bg-white dark:bg-zinc-900 border border-input rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        disabled={isUploading}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-[#4f95ff]">
                  {uploadProgress >= 100 ? "מעבד..." : "מעלה..."}
                </span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              {isStuck && (
                <div className="pt-2 flex flex-col gap-2 items-center text-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-xs text-amber-600">ממתין לשרת...</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleManualRefresh}
                    className="w-full"
                  >
                    <RefreshCw className="w-3 h-3 ml-2" />
                    סיום ורענון
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isUploading && !isStuck}
            >
              ביטול
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || (isUploading && !isStuck)}
              className="bg-[#a24ec1] hover:bg-[#a24ec1]/90 w-32"
            >
              {isUploading ? (
                "מעלה..."
              ) : (
                <>העלה {files.length > 0 && `(${files.length})`}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
