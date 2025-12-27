"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateSlaPolicy } from "@/app/actions/tickets";
import { Loader2, Timer, AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface SlaConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policies: any[];
  onOpenAutomationModal?: () => void;
}

const MINIMUM_MINUTES = 1; // TODO: Change back to 5 after testing

export default function SlaConfigModal({
  open,
  onOpenChange,
  policies,
  onOpenAutomationModal,
}: SlaConfigModalProps) {
  // ... (keep state logic same) ...
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to get policy or defaults
  const getPolicy = (priority: string) =>
    policies.find((p) => p.priority === priority) || {
      responseTimeMinutes: 60,
      resolveTimeMinutes: 24 * 60,
    };

  const [configs, setConfigs] = useState({
    CRITICAL: getPolicy("CRITICAL"),
    HIGH: getPolicy("HIGH"),
    MEDIUM: getPolicy("MEDIUM"),
    LOW: getPolicy("LOW"),
  });

  const handleBlur = (
    priority: keyof typeof configs,
    field: string,
    value: string
  ) => {
    let intVal = parseInt(value) || 0;
    if (intVal < MINIMUM_MINUTES) {
      intVal = MINIMUM_MINUTES;
    }
    handleUpdate(priority as any, field, String(intVal));
  };

  const handleUpdate = (
    priority: keyof typeof configs,
    field: string,
    value: string
  ) => {
    setConfigs((prev) => ({
      ...prev,
      [priority]: {
        ...prev[priority],
        [field]: parseInt(value) || 0,
      },
    }));
    setError(null); // Clear error on change
  };

  const handleSave = async () => {
    // Validation
    for (const [priority, config] of Object.entries(configs)) {
      if (
        config.responseTimeMinutes < MINIMUM_MINUTES ||
        config.resolveTimeMinutes < MINIMUM_MINUTES
      ) {
        setError(
          `זמן המינימום להגדרה הוא ${MINIMUM_MINUTES} דקות (נמצא ערך נמוך יותר ב${getPriorityLabel(
            priority
          )})`
        );
        return;
      }
    }

    setLoading(true);
    try {
      await Promise.all([
        updateSlaPolicy({ priority: "CRITICAL", ...configs.CRITICAL }),
        updateSlaPolicy({ priority: "HIGH", ...configs.HIGH }),
        updateSlaPolicy({ priority: "MEDIUM", ...configs.MEDIUM }),
        updateSlaPolicy({ priority: "LOW", ...configs.LOW }),
      ]);
      toast({ title: "מדיניות SLA עודכנה בהצלחה" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "שגיאה בעדכון המדיניות", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "קריטי";
      case "HIGH":
        return "גבוה";
      case "MEDIUM":
        return "בינוני";
      case "LOW":
        return "נמוך";
      default:
        return priority;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-red-100 text-red-700 border-red-200";
      case "HIGH":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "LOW":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[800px] p-0 overflow-hidden"
        dir="rtl"
        showCloseButton={false} // Hide default close button
      >
        <DialogHeader className="bg-slate-50 p-6 border-b text-right relative">
          {/* Custom Close Button on Left */}
          <DialogClose className="absolute left-4 top-4 opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
            <X className="h-5 w-5 text-slate-500 hover:text-slate-800" />
            <span className="sr-only">Close</span>
          </DialogClose>

          <div className="flex flex-row items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-100 rounded-lg shrink-0">
              <Timer className="w-6 h-6 text-blue-600" />
            </div>
            <DialogTitle className="text-xl font-bold flex-1 text-right">
              הגדרות SLA
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-600 text-base text-right pr-1">
            הגדר זמני יעד לתגובה ופתרון לכל רמת עדיפות.
            <br />
            <span className="text-slate-500 text-sm block mt-1">
              * הזמנים נקובים בדקות. מינימום 1 דקה לערך. (מצב בדיקה)
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 space-y-6 bg-white">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>שגיאה</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-6">
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((priority) => (
              <div
                key={priority}
                className="flex items-center gap-6 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="w-24 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-semibold w-full text-center border",
                      getPriorityColor(priority)
                    )}
                  >
                    {getPriorityLabel(priority)}
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-500 block text-right">
                      זמן תגובה (דקות)
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        className="text-right pl-4 pr-3 font-medium h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
                        value={
                          configs[priority as keyof typeof configs]
                            .responseTimeMinutes
                        }
                        onChange={(e) =>
                          handleUpdate(
                            priority as any,
                            "responseTimeMinutes",
                            e.target.value
                          )
                        }
                        onBlur={(e) =>
                          handleBlur(
                            priority as any,
                            "responseTimeMinutes",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-500 block text-right">
                      זמן פתרון (דקות)
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        className="text-right pl-4 pr-3 font-medium h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
                        value={
                          configs[priority as keyof typeof configs]
                            .resolveTimeMinutes
                        }
                        onChange={(e) =>
                          handleUpdate(
                            priority as any,
                            "resolveTimeMinutes",
                            e.target.value
                          )
                        }
                        onBlur={(e) =>
                          handleBlur(
                            priority as any,
                            "resolveTimeMinutes",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="bg-slate-50 p-6 border-t flex-row-reverse sm:justify-start gap-3">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-[#4f95ff] hover:bg-blue-600 text-white min-w-[120px] h-11 text-base shadow-sm"
          >
            {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            שמור שינויים
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-white border-slate-300 hover:bg-slate-50 h-11"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
