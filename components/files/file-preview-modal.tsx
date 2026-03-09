"use client";

import { File as FileModel } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, FileText } from "lucide-react";
import { TextPreview } from "./previews/text-preview";
import { ImagePreview } from "./previews/image-preview";
import { CsvPreview } from "./previews/csv-preview";
import { ExcelPreview } from "./previews/excel-preview";
import dynamic from "next/dynamic";
const PdfPreview = dynamic(() => import("./previews/pdf-preview").then((m) => ({ default: m.PdfPreview })), { ssr: false });

interface FilePreviewModalProps {
  file: FileModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
}

type PreviewType = "image" | "pdf" | "csv" | "excel" | "text" | "unsupported";

function getPreviewType(file: FileModel): PreviewType {
  const mime = file.type?.toLowerCase() || "";
  const name = file.name?.toLowerCase() || "";
  const ext = name.split(".").pop() || "";

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "text/csv" || ext === "csv") return "csv";
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) return "excel";
  if (
    mime.startsWith("text/") ||
    ["txt", "json", "md", "log", "xml", "yml", "yaml", "html", "css", "js", "ts"].includes(ext)
  ) return "text";

  return "unsupported";
}

function getTypeBadge(type: PreviewType): string {
  const labels: Record<PreviewType, string> = {
    image: "תמונה",
    pdf: "PDF",
    csv: "CSV",
    excel: "Excel",
    text: "טקסט",
    unsupported: "קובץ",
  };
  return labels[type];
}

export function FilePreviewModal({
  file,
  open,
  onOpenChange,
  onDownload,
}: FilePreviewModalProps) {
  const previewType = getPreviewType(file);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 shrink-0" />
            <span className="truncate">
              {(file as any).displayName || file.name}
            </span>
            <span className="text-xs font-normal bg-muted px-2 py-0.5 rounded-md shrink-0">
              {getTypeBadge(previewType)}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            תצוגה מקדימה של קובץ
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {previewType === "image" && <ImagePreview fileId={file.id} />}
          {previewType === "pdf" && <PdfPreview fileId={file.id} />}
          {previewType === "csv" && <CsvPreview fileId={file.id} />}
          {previewType === "excel" && <ExcelPreview fileId={file.id} />}
          {previewType === "text" && <TextPreview fileId={file.id} />}
          {previewType === "unsupported" && (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-muted-foreground">
              <FileText className="w-16 h-16" />
              <p>אין תצוגה מקדימה זמינה לסוג קובץ זה</p>
              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                הורד קובץ
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            onClick={onDownload}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#4f95ff]/10 text-[#4f95ff] rounded-md hover:bg-[#4f95ff]/20 transition-colors"
          >
            <Download className="w-4 h-4" />
            הורד
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            סגור
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
