"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HardDrive, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

type FileSource = "internal" | "drive";

interface SourceSwitcherProps {
  driveConnected: boolean;
}

export function SourceSwitcher({ driveConnected }: SourceSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSource = (searchParams.get("source") as FileSource) || "internal";

  const handleSwitch = (source: FileSource) => {
    if (source === currentSource) return;
    if (source === "drive") {
      router.push("/files?source=drive");
    } else {
      router.push("/files");
    }
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg" role="group" aria-label="בחירת מקור קבצים">
      <Button
        variant={currentSource === "internal" ? "default" : "ghost"}
        size="sm"
        className={cn(
          "h-8 px-3 gap-2",
          currentSource === "internal"
            ? "bg-white shadow-sm text-foreground"
            : "hover:bg-white/50",
        )}
        onClick={() => handleSwitch("internal")}
        aria-label="ספריית קבצים"
        aria-pressed={currentSource === "internal"}
      >
        <HardDrive className="w-4 h-4" />
        <span className="hidden sm:inline">ספריית קבצים</span>
      </Button>
      <Button
        variant={currentSource === "drive" ? "default" : "ghost"}
        size="sm"
        className={cn(
          "h-8 px-3 gap-2",
          currentSource === "drive"
            ? "bg-white shadow-sm text-foreground"
            : "hover:bg-white/50",
        )}
        onClick={() => handleSwitch("drive")}
        aria-label="Google Drive"
        aria-pressed={currentSource === "drive"}
      >
        <Cloud className="w-4 h-4" />
        <span className="hidden sm:inline">Google Drive</span>
        {!driveConnected && currentSource !== "drive" && (
          <>
            <span className="w-2 h-2 rounded-full bg-orange-400" aria-hidden="true" />
            <span className="sr-only">לא מחובר</span>
          </>
        )}
      </Button>
    </div>
  );
}
