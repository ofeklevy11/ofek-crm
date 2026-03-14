"use client";

import { useEffect, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MAX_ROWS = 200;

interface ExcelPreviewProps {
  fileId: number;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export function ExcelPreview({ fileId }: ExcelPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) throw new Error("Failed to load file");

        const buffer = await res.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });

        if (cancelled) return;

        const parsed: SheetData[] = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
          const headers = (json[0] || []).map(String);
          const dataRows = json.slice(1);
          return {
            name,
            headers,
            rows: dataRows.slice(0, MAX_ROWS).map((r) => r.map(String)),
            totalRows: dataRows.length,
          };
        });

        setSheets(parsed);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [fileId]);

  if (loading) {
    return (
      <div className="space-y-2 p-4" role="status" aria-label="טוען תצוגה מקדימה...">
        <span className="sr-only">טוען תצוגה מקדימה...</span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {error}
      </div>
    );
  }

  const current = sheets[activeSheet];
  if (!current) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        הקובץ ריק
      </div>
    );
  }

  return (
    <div>
      {sheets.length > 1 && (
        <div className="flex gap-1 mb-2 flex-wrap" dir="ltr" role="tablist" aria-label="גיליונות">
          {sheets.map((sheet, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              role="tab"
              aria-selected={i === activeSheet}
              className={cn(
                "px-3 py-1 text-xs rounded-md border transition-colors",
                i === activeSheet
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
              )}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <ScrollArea className="h-[60vh] rounded-md border" dir="ltr">
        <Table aria-label="תצוגה מקדימה של נתונים">
          <TableHeader>
            <TableRow>
              {current.headers.map((h, i) => (
                <TableHead key={i} className="whitespace-nowrap text-left">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j} className="whitespace-nowrap text-left">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {current.totalRows > MAX_ROWS && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          מוצגות {MAX_ROWS} מתוך {current.totalRows} שורות. הורד את הקובץ לצפייה מלאה.
        </p>
      )}
    </div>
  );
}
