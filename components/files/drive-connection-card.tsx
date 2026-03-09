"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Cloud, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DriveConnectionCard() {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/integrations/google/drive/connect");
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "שגיאה בחיבור ל-Google Drive");
        return;
      }

      window.location.href = data.url;
    } catch {
      toast.error("שגיאה בחיבור ל-Google Drive");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
        <Cloud className="w-10 h-10 text-[#4f95ff]" />
      </div>

      <div className="text-center space-y-2 max-w-md">
        <h3 className="text-xl font-semibold">Google Drive</h3>
        <p className="text-muted-foreground">
          חבר את חשבון Google Drive שלך כדי לגשת לקבצים שלך ישירות מהמערכת
        </p>
      </div>

      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="bg-[#4f95ff] hover:bg-[#4f95ff]/90 gap-2"
        size="lg"
      >
        {isConnecting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Cloud className="w-4 h-4" />
        )}
        חבר Google Drive
      </Button>
    </div>
  );
}
